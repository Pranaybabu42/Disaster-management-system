from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.emergencies import admin_router, router as emergencies_router
from app.core.config import get_settings
from app.core.database import create_mongo_client, initialize_indexes
from app.core.demo_data import seed_demo_data
from app.core.error_responses import ErrorResponse
from app.modules.auth.errors import AuthServiceError


@asynccontextmanager
async def lifespan(application: FastAPI):
    settings = get_settings()
    client = create_mongo_client(settings)
    client.admin.command("ping")
    database = client[settings.mongo_database]
    initialize_indexes(database)
    if settings.environment.lower() == "development":
        seed_demo_data(database, settings)
    application.state.mongo_client = client
    application.state.database = database
    try:
        yield
    finally:
        client.close()


settings = get_settings()
app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(auth_router, prefix=settings.api_v1_prefix)
app.include_router(emergencies_router, prefix=settings.api_v1_prefix)
app.include_router(admin_router, prefix=settings.api_v1_prefix)

logger = logging.getLogger("uvicorn.error")


def error_response(
    *,
    status_code: int,
    code: str,
    exception_name: str,
    message: str,
    details: list[dict] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body = ErrorResponse(
        status_code=status_code,
        code=code,
        exception_name=exception_name,
        message=message,
        details=details,
    )
    return JSONResponse(status_code=status_code, content=body.model_dump(exclude_none=True), headers=headers)


@app.exception_handler(AuthServiceError)
async def auth_service_error_handler(request: Request, exc: AuthServiceError) -> JSONResponse:
    return error_response(
        status_code=exc.status_code,
        code=exc.code,
        exception_name=type(exc).__name__,
        message=exc.detail,
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Do not echo rejected values: request bodies may contain passwords.
    details = [
        {"loc": error.get("loc", []), "msg": error.get("msg", "Invalid value"), "type": error.get("type", "value_error")}
        for error in exc.errors()
    ]
    return error_response(
        status_code=422,
        code="VALIDATION_ERROR",
        exception_name=type(exc).__name__,
        message="Request validation failed",
        details=details,
    )


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code_by_status = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        405: "METHOD_NOT_ALLOWED",
        409: "CONFLICT",
        413: "PAYLOAD_TOO_LARGE",
        415: "UNSUPPORTED_MEDIA_TYPE",
        422: "VALIDATION_ERROR",
        429: "RATE_LIMIT_EXCEEDED",
        503: "SERVICE_UNAVAILABLE",
    }
    message = exc.detail if isinstance(exc.detail, str) else "The request could not be completed"
    return error_response(
        status_code=exc.status_code,
        code=getattr(exc, "error_code", code_by_status.get(exc.status_code, "HTTP_ERROR")),
        exception_name=getattr(exc, "exception_name", type(exc).__name__),
        message=message,
        headers=exc.headers,
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled application exception", exc_info=exc)
    return error_response(
        status_code=500,
        code="INTERNAL_SERVER_ERROR",
        exception_name="InternalServerError",
        message="An unexpected error occurred",
    )


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
