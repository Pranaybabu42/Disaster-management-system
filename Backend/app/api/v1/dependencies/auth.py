from typing import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pymongo.database import Database

from app.core.config import Settings, get_settings
from app.modules.auth.errors import AuthenticationRequired
from app.modules.auth.repository import AuthRepository
from app.modules.auth.service import AuthService


bearer_scheme = HTTPBearer(auto_error=False)


def get_database(request: Request) -> Database:
    database = getattr(request.app.state, "database", None)
    if database is None:
        raise HTTPException(status_code=503, detail="Database is unavailable")
    return database


def get_auth_service(
    database: Database = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> AuthService:
    return AuthService(AuthRepository(database), settings)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    service: AuthService = Depends(get_auth_service),
) -> dict:
    if credentials is None:
        raise AuthenticationRequired
    return service.authenticate_access_token(credentials.credentials)


def require_roles(*roles: str) -> Callable:
    def dependency(user: dict = Depends(get_current_user)) -> dict:
        if not set(roles).intersection(user.get("roles", [])):
            raise HTTPException(status_code=403, detail="Insufficient role")
        return user
    return dependency


def require_scopes(*scopes: str) -> Callable:
    def dependency(user: dict = Depends(get_current_user)) -> dict:
        if not set(scopes).issubset(set(user.get("scopes", []))):
            raise HTTPException(status_code=403, detail="Insufficient scope")
        return user
    return dependency


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"
