from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from uuid import uuid4

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from argon2.low_level import Type

from app.core.config import Settings


class TokenError(Exception):
    pass


def build_password_hasher(settings: Settings) -> PasswordHasher:
    return PasswordHasher(
        time_cost=settings.password_hash_time_cost,
        memory_cost=settings.password_hash_memory_cost,
        parallelism=settings.password_hash_parallelism,
        salt_len=settings.password_hash_salt_length,
        hash_len=settings.password_hash_length,
        type=Type.ID,
    )


def hash_password(password: str, hasher: PasswordHasher) -> str:
    # Argon2 generates an independent cryptographically random salt per password.
    return hasher.hash(password)


def verify_password(password: str, password_hash: str, hasher: PasswordHasher) -> bool:
    try:
        return hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str, hasher: PasswordHasher) -> bool:
    try:
        return hasher.check_needs_rehash(password_hash)
    except (VerificationError, InvalidHashError):
        return False


def issue_token(*, user_id: str, session_id: str, token_type: str, settings: Settings) -> tuple[str, str, datetime]:
    now = datetime.now(timezone.utc)
    token_id = uuid4().hex
    lifetime = timedelta(minutes=settings.access_token_minutes) if token_type == "access" else timedelta(days=settings.refresh_token_days)
    expires = now + lifetime
    claims = {
        "sub": user_id,
        "sid": session_id,
        "jti": token_id,
        "typ": token_type,
        "iat": now,
        "exp": expires,
    }
    token = jwt.encode(
        claims,
        settings.jwt_signing_key.get_secret_value(),
        algorithm=settings.jwt_algorithm,
        headers={"kid": settings.jwt_signing_key_id},
    )
    return token, token_id, expires


def decode_token(token: str, *, expected_type: str, settings: Settings) -> dict:
    try:
        header = jwt.get_unverified_header(token)
        key_id = header.get("kid")
        if key_id is None:
            signing_key = settings.jwt_signing_key.get_secret_value()
        else:
            signing_key = settings.verification_keys.get(key_id)
            if signing_key is None:
                raise TokenError("Unknown signing key")
        claims = jwt.decode(
            token,
            signing_key,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "sid", "jti", "typ", "iat", "exp"]},
        )
        if claims.get("typ") != expected_type:
            raise TokenError("Invalid token type")
        return claims
    except (jwt.PyJWTError, TokenError) as exc:
        raise TokenError("Invalid or expired token") from exc


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_session_id() -> str:
    return secrets.token_urlsafe(24)
