class AuthServiceError(Exception):
    status_code = 400
    code = "AUTH_REQUEST_FAILED"
    message = "Authentication request failed"
    headers: dict[str, str] = {}

    def __init__(self, message: str | None = None, *, headers: dict[str, str] | None = None):
        super().__init__(message or self.message)
        self.detail = message or self.message
        self.headers = headers if headers is not None else self.headers


class InvalidCredentials(AuthServiceError):
    status_code = 401
    code = "AUTH_INVALID_CREDENTIALS"
    message = "Invalid email or password"
    headers = {"WWW-Authenticate": "Bearer"}


class AuthenticationRequired(AuthServiceError):
    status_code = 401
    code = "AUTHENTICATION_REQUIRED"
    message = "Authentication required"
    headers = {"WWW-Authenticate": "Bearer"}


class InvalidRefreshToken(AuthServiceError):
    status_code = 401
    code = "INVALID_REFRESH_TOKEN"
    message = "Refresh session is invalid or expired"


class RefreshReplayDetected(AuthServiceError):
    status_code = 401
    code = "REFRESH_TOKEN_REPLAY"
    message = "Refresh token replay detected; sessions have been revoked"


class InvalidResetToken(AuthServiceError):
    status_code = 400
    code = "INVALID_PASSWORD_RESET_TOKEN"
    message = "Password reset link is invalid or expired"


class ResourceNotFound(AuthServiceError):
    status_code = 404
    code = "RESOURCE_NOT_FOUND"
    message = "Resource not found"


class RateLimitExceeded(AuthServiceError):
    status_code = 429
    code = "RATE_LIMIT_EXCEEDED"
    message = "Too many attempts. Please try again later."

    def __init__(self, retry_after: int):
        super().__init__(headers={"Retry-After": str(retry_after)})
