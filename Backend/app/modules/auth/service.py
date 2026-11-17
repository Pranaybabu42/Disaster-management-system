from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import secrets
from uuid import uuid4

from app.core.config import Settings
from app.modules.auth.errors import (
    AuthenticationRequired,
    InvalidCredentials,
    InvalidRefreshToken,
    InvalidResetToken,
    RateLimitExceeded,
    RefreshReplayDetected,
    ResourceNotFound,
)
from app.modules.auth.repository import AuthRepository, DuplicateEmailError
from app.modules.auth.security import (
    TokenError,
    build_password_hasher,
    decode_token,
    hash_password,
    issue_token,
    new_session_id,
    password_needs_rehash,
    token_digest,
    verify_password,
)


GENERIC_RECOVERY_MESSAGE = "If an account matches that information, recovery instructions will be sent."
GENERIC_REGISTRATION_MESSAGE = "If registration is available for this address, you can sign in now."


@dataclass(frozen=True)
class RequestContext:
    ip_address: str
    user_agent: str


@dataclass(frozen=True)
class AuthTokens:
    access_token: str
    access_expires_in: int
    refresh_token: str
    refresh_expires_at: datetime
    user: dict


@dataclass(frozen=True)
class RecoveryEmail:
    email: str
    token: str


class AuthService:
    """Authentication use cases and policies. Persistence is delegated to AuthRepository."""

    def __init__(self, repository: AuthRepository, settings: Settings):
        self.repository = repository
        self.settings = settings

    def _audit(self, event: str, context: RequestContext, *, user_id: str | None = None, email: str | None = None) -> None:
        self.repository.write_audit_event({
            "event": event,
            "user_id": user_id,
            "email_normalized": email,
            "ip_address": context.ip_address,
            "user_agent": context.user_agent[:300],
            "created_at": datetime.now(timezone.utc),
        })

    def _rate_limit(self, key: str, limit: int, window_seconds: int) -> None:
        count = self.repository.increment_rate_limit(key, window_seconds)
        if count > limit:
            raise RateLimitExceeded(window_seconds)

    def _issue_session(self, user: dict, context: RequestContext) -> AuthTokens:
        now = datetime.now(timezone.utc)
        session_id = new_session_id()
        access_token, _, access_expires = issue_token(
            user_id=str(user["_id"]), session_id=session_id, token_type="access", settings=self.settings,
        )
        refresh_token, _, refresh_expires = issue_token(
            user_id=str(user["_id"]), session_id=session_id, token_type="refresh", settings=self.settings,
        )
        self.repository.create_session({
            "_id": session_id,
            "user_id": str(user["_id"]),
            "refresh_token_hash": token_digest(refresh_token),
            "created_at": now,
            "last_used_at": now,
            "expires_at": refresh_expires,
            "revoked_at": None,
            "ip_address": context.ip_address,
            "user_agent": context.user_agent[:300],
        })
        return AuthTokens(
            access_token=access_token,
            access_expires_in=int((access_expires - now).total_seconds()),
            refresh_token=refresh_token,
            refresh_expires_at=refresh_expires,
            user=user,
        )

    def register(self, *, email: str, full_name: str, password: str, context: RequestContext) -> str:
        self._rate_limit(
            f"register:{context.ip_address}",
            self.settings.registration_rate_limit,
            self.settings.registration_rate_window_seconds,
        )
        now = datetime.now(timezone.utc)
        user = {
            "_id": uuid4().hex,
            "email": email,
            "email_normalized": email,
            "full_name": full_name.strip(),
            "password_hash": hash_password(password, build_password_hasher(self.settings)),
            "roles": ["user"],
            "scopes": ["profile:read:self", "profile:write:self"],
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }
        try:
            self.repository.create_user(user)
        except DuplicateEmailError:
            self._audit("registration_duplicate", context, email=email)
            return GENERIC_REGISTRATION_MESSAGE
        self._audit("registration_succeeded", context, user_id=user["_id"], email=email)
        return GENERIC_REGISTRATION_MESSAGE

    def login(self, *, email: str, password: str, context: RequestContext, account_type: str | None = None) -> AuthTokens:
        self._rate_limit(
            f"login:ip:{context.ip_address}", self.settings.login_rate_limit, self.settings.login_rate_window_seconds,
        )
        self._rate_limit(
            f"login:account:{email}", self.settings.login_rate_limit, self.settings.login_rate_window_seconds,
        )
        user = self.repository.find_user_by_email(email)
        hasher = build_password_hasher(self.settings)
        if user is None:
            hasher.hash(password)
            self._audit("login_failed", context, email=email)
            raise InvalidCredentials
        password_hash = user.get("password_hash", user.get("hashed_password", ""))
        if not user.get("is_active", True) or not verify_password(password, password_hash, hasher):
            self._audit("login_failed", context, user_id=str(user["_id"]), email=email)
            raise InvalidCredentials
        expected_role = {"admin": "admin", "user": "user", "rescue_team": "responder"}.get(account_type)
        if account_type and (expected_role is None or expected_role not in user.get("roles", [])):
            self._audit("login_failed", context, user_id=str(user["_id"]), email=email)
            raise InvalidCredentials
        if password_needs_rehash(password_hash, hasher):
            self.repository.update_password_hash(
                user["_id"],
                password_hash,
                hash_password(password, hasher),
                datetime.now(timezone.utc),
            )
        tokens = self._issue_session(user, context)
        self._audit("login_succeeded", context, user_id=str(user["_id"]), email=email)
        return tokens

    def authenticate_access_token(self, token: str) -> dict:
        try:
            claims = decode_token(token, expected_type="access", settings=self.settings)
        except TokenError as exc:
            raise AuthenticationRequired from exc
        now = datetime.now(timezone.utc)
        session = self.repository.find_active_session(claims["sid"], claims["sub"], now)
        user = self.repository.find_user_by_subject(claims["sub"], active_only=True)
        if not session or not user:
            raise AuthenticationRequired
        return user

    def refresh(self, token: str, context: RequestContext) -> AuthTokens:
        try:
            claims = decode_token(token, expected_type="refresh", settings=self.settings)
        except TokenError as exc:
            raise InvalidRefreshToken from exc
        now = datetime.now(timezone.utc)
        session = self.repository.find_session(claims["sid"], claims["sub"])
        if not session:
            raise InvalidRefreshToken
        presented_hash = token_digest(token)
        if session.get("revoked_at") is not None or session.get("refresh_token_hash") != presented_hash:
            self.repository.revoke_user_sessions(claims["sub"], now)
            self._audit("refresh_replay_detected", context, user_id=claims["sub"])
            raise RefreshReplayDetected
        if session["expires_at"] <= now:
            raise InvalidRefreshToken
        user = self.repository.find_user_by_subject(claims["sub"], active_only=True)
        if not user:
            self.repository.revoke_session(session["_id"], claims["sub"], now)
            raise InvalidRefreshToken

        access_token, _, access_expires = issue_token(
            user_id=str(user["_id"]), session_id=session["_id"], token_type="access", settings=self.settings,
        )
        new_refresh_token, _, refresh_expires = issue_token(
            user_id=str(user["_id"]), session_id=session["_id"], token_type="refresh", settings=self.settings,
        )
        rotated = self.repository.rotate_refresh_token(
            session_id=session["_id"],
            user_id=str(user["_id"]),
            old_token_hash=presented_hash,
            new_token_hash=token_digest(new_refresh_token),
            now=now,
            expires_at=refresh_expires,
        )
        if not rotated:
            self.repository.revoke_user_sessions(str(user["_id"]), now)
            self._audit("refresh_replay_detected", context, user_id=str(user["_id"]))
            raise RefreshReplayDetected
        self._audit("refresh_succeeded", context, user_id=str(user["_id"]))
        return AuthTokens(
            access_token=access_token,
            access_expires_in=int((access_expires - now).total_seconds()),
            refresh_token=new_refresh_token,
            refresh_expires_at=refresh_expires,
            user=user,
        )

    def logout(self, user: dict, access_token: str, context: RequestContext) -> None:
        try:
            claims = decode_token(access_token, expected_type="access", settings=self.settings)
        except TokenError:
            raise AuthenticationRequired
        self.repository.revoke_session(claims["sid"], str(user["_id"]), datetime.now(timezone.utc))
        self._audit("logout", context, user_id=str(user["_id"]))

    def logout_all(self, user: dict, context: RequestContext) -> None:
        self.repository.revoke_user_sessions(str(user["_id"]), datetime.now(timezone.utc))
        self._audit("logout_all", context, user_id=str(user["_id"]))

    def list_sessions(self, user: dict) -> list[dict]:
        return self.repository.list_active_sessions(str(user["_id"]), datetime.now(timezone.utc))

    def revoke_session(self, user: dict, session_id: str, context: RequestContext) -> None:
        revoked = self.repository.revoke_session(session_id, str(user["_id"]), datetime.now(timezone.utc))
        if not revoked:
            raise ResourceNotFound("Session not found")
        self._audit("session_revoked", context, user_id=str(user["_id"]))

    def forgot_password(self, *, email: str, context: RequestContext) -> RecoveryEmail | None:
        self._rate_limit(
            f"recovery:ip:{context.ip_address}", self.settings.recovery_rate_limit, self.settings.recovery_rate_window_seconds,
        )
        self._rate_limit(
            f"recovery:account:{email}", self.settings.recovery_rate_limit, self.settings.recovery_rate_window_seconds,
        )
        user = self.repository.find_user_by_email(email)
        recovery_email = None
        if user and self.settings.email_delivery_enabled:
            raw_token = secrets.token_urlsafe(32)
            now = datetime.now(timezone.utc)
            self.repository.create_password_reset_token(
                token_digest(raw_token), str(user["_id"]), now, now + timedelta(minutes=30),
            )
            recovery_email = RecoveryEmail(user.get("email", email), raw_token)
        self._audit(
            "password_recovery_requested",
            context,
            user_id=str(user["_id"]) if user else None,
            email=email,
        )
        return recovery_email

    def reset_password(self, *, token: str, new_password: str, context: RequestContext) -> None:
        now = datetime.now(timezone.utc)
        reset_record = self.repository.consume_password_reset_token(token_digest(token), now)
        if not reset_record:
            raise InvalidResetToken
        user = self.repository.find_user_by_subject(reset_record["user_id"], active_only=True)
        if not user:
            raise InvalidResetToken
        self.repository.set_password_hash(
            user["_id"], hash_password(new_password, build_password_hasher(self.settings)), now,
        )
        self.repository.revoke_user_sessions(reset_record["user_id"], now)
        self.repository.delete_user_password_reset_tokens(reset_record["user_id"])
        self._audit("password_reset_completed", context, user_id=reset_record["user_id"])
