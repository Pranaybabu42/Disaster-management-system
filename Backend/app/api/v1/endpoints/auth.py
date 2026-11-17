from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status

from app.api.v1.dependencies.auth import client_ip, get_auth_service, get_current_user
from app.core.config import Settings, get_settings
from app.core.http_errors import StructuredHTTPException
from app.modules.auth.email import send_password_reset_email
from app.modules.auth.errors import InvalidRefreshToken, RefreshReplayDetected
from app.modules.auth.schemas import (
    AuthResponse,
    CredentialsInput,
    ForgotPasswordInput,
    MessageResponse,
    RegisterInput,
    ResetPasswordInput,
    SessionResponse,
    UserResponse,
)
from app.modules.auth.service import AuthService, AuthTokens, RecoveryEmail, RequestContext


router = APIRouter(prefix="/auth", tags=["authentication"])


def request_context(request: Request) -> RequestContext:
    return RequestContext(
        ip_address=client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
    )


def serialize_user(user: dict) -> UserResponse:
    email = user.get("email") or user.get("username", "")
    return UserResponse(
        id=str(user["_id"]),
        email=email,
        full_name=user.get("full_name") or user.get("name") or email,
        roles=user.get("roles", ["user"]),
        scopes=user.get("scopes", []),
    )


def serialize_auth_result(tokens: AuthTokens) -> AuthResponse:
    return AuthResponse(
        access_token=tokens.access_token,
        expires_in=tokens.access_expires_in,
        user=serialize_user(tokens.user),
    )


def set_refresh_cookie(response: Response, tokens: AuthTokens, settings: Settings) -> None:
    max_age = max(0, int((tokens.refresh_expires_at - datetime.now(timezone.utc)).total_seconds()))
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=tokens.refresh_token,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite=settings.refresh_cookie_samesite,
        path=f"{settings.api_v1_prefix}/auth",
        max_age=max_age,
    )


def clear_refresh_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite=settings.refresh_cookie_samesite,
        path=f"{settings.api_v1_prefix}/auth",
    )


def refresh_cookie_clear_header(settings: Settings) -> str:
    attributes = [
        f"{settings.refresh_cookie_name}=",
        "Max-Age=0",
        f"Path={settings.api_v1_prefix}/auth",
        "HttpOnly",
        f"SameSite={settings.refresh_cookie_samesite.capitalize()}",
    ]
    if settings.refresh_cookie_secure:
        attributes.append("Secure")
    return "; ".join(attributes)


@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_202_ACCEPTED)
def register(
    payload: RegisterInput,
    request: Request,
    service: AuthService = Depends(get_auth_service),
) -> MessageResponse:
    message = service.register(
        email=payload.email,
        full_name=payload.full_name,
        password=payload.password,
        context=request_context(request),
    )
    return MessageResponse(message=message)


@router.post("/login", response_model=AuthResponse)
def login(
    payload: CredentialsInput,
    request: Request,
    response: Response,
    service: AuthService = Depends(get_auth_service),
    settings: Settings = Depends(get_settings),
) -> AuthResponse:
    tokens = service.login(
        email=payload.email,
        password=payload.password,
        account_type=payload.account_type,
        context=request_context(request),
    )
    set_refresh_cookie(response, tokens, settings)
    return serialize_auth_result(tokens)


@router.post("/refresh", response_model=AuthResponse)
def refresh(
    request: Request,
    response: Response,
    service: AuthService = Depends(get_auth_service),
    settings: Settings = Depends(get_settings),
) -> AuthResponse:
    token = request.cookies.get(settings.refresh_cookie_name)
    if not token:
        raise StructuredHTTPException(
            status_code=401,
            code="INVALID_REFRESH_TOKEN",
            exception_name="InvalidRefreshToken",
            detail="Refresh session is invalid or expired",
            headers={"Set-Cookie": refresh_cookie_clear_header(settings)},
        )
    try:
        tokens = service.refresh(token, request_context(request))
    except (InvalidRefreshToken, RefreshReplayDetected) as exc:
        raise StructuredHTTPException(
            status_code=exc.status_code,
            code=exc.code,
            exception_name=type(exc).__name__,
            detail=exc.detail,
            headers={"Set-Cookie": refresh_cookie_clear_header(settings)},
        ) from exc
    set_refresh_cookie(response, tokens, settings)
    return serialize_auth_result(tokens)


@router.post("/logout", response_model=MessageResponse)
def logout(
    response: Response,
    request: Request,
    user: dict = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
    settings: Settings = Depends(get_settings),
) -> MessageResponse:
    token = request.headers.get("authorization", "").partition(" ")[2]
    service.logout(user, token, request_context(request))
    clear_refresh_cookie(response, settings)
    return MessageResponse(message="Signed out")


@router.post("/logout-all", response_model=MessageResponse)
def logout_all(
    response: Response,
    request: Request,
    user: dict = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
    settings: Settings = Depends(get_settings),
) -> MessageResponse:
    service.logout_all(user, request_context(request))
    clear_refresh_cookie(response, settings)
    return MessageResponse(message="All sessions have been signed out")


@router.get("/me", response_model=UserResponse)
def me(user: dict = Depends(get_current_user)) -> UserResponse:
    return serialize_user(user)


@router.get("/sessions", response_model=list[SessionResponse])
def list_sessions(
    user: dict = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
) -> list[SessionResponse]:
    return [SessionResponse(**session) for session in service.list_sessions(user)]


@router.delete("/sessions/{session_id}", response_model=MessageResponse)
def revoke_session(
    session_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
) -> MessageResponse:
    service.revoke_session(user, session_id, request_context(request))
    return MessageResponse(message="Session revoked")


@router.post("/forgot-password", response_model=MessageResponse, status_code=status.HTTP_202_ACCEPTED)
def forgot_password(
    payload: ForgotPasswordInput,
    background_tasks: BackgroundTasks,
    request: Request,
    service: AuthService = Depends(get_auth_service),
) -> MessageResponse:
    recovery_email = service.forgot_password(email=payload.email, context=request_context(request))
    if recovery_email:
        background_tasks.add_task(send_password_reset_email, service.settings, recovery_email.email, recovery_email.token)
    return MessageResponse(message="If an account matches that information, recovery instructions will be sent.")


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(
    payload: ResetPasswordInput,
    request: Request,
    service: AuthService = Depends(get_auth_service),
) -> MessageResponse:
    service.reset_password(token=payload.token, new_password=payload.new_password, context=request_context(request))
    return MessageResponse(message="Password updated. Please sign in again.")
