from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Application configuration. Secrets are loaded from Backend/.env."""

    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "Disaster Management System API"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    mongo_uri: str = "mongodb://localhost:27017/DMS"
    mongo_database: str = "DMS"
    jwt_signing_key: SecretStr = Field(default=SecretStr(""), min_length=32)
    jwt_signing_key_id: str = "primary"
    jwt_previous_signing_keys: str = ""
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = Field(default=15, ge=1, le=1440)
    refresh_token_days: int = Field(default=30, ge=1, le=365)
    password_hash_algorithm: str = "argon2id"
    password_hash_time_cost: int = Field(default=3, ge=1, le=10)
    password_hash_memory_cost: int = Field(default=65536, ge=19456, le=1048576)
    password_hash_parallelism: int = Field(default=2, ge=1, le=16)
    password_hash_salt_length: int = Field(default=16, ge=16, le=64)
    password_hash_length: int = Field(default=32, ge=16, le=64)
    login_rate_limit: int = Field(default=10, ge=1, le=1000)
    login_rate_window_seconds: int = Field(default=60, ge=1, le=86400)
    registration_rate_limit: int = Field(default=5, ge=1, le=1000)
    registration_rate_window_seconds: int = Field(default=3600, ge=1, le=86400)
    recovery_rate_limit: int = Field(default=3, ge=1, le=1000)
    recovery_rate_window_seconds: int = Field(default=3600, ge=1, le=86400)
    cors_origins: str = "http://localhost:5173"
    refresh_cookie_name: str = "dms_refresh_token"
    refresh_cookie_secure: bool = False
    refresh_cookie_samesite: str = "lax"
    smtp_host: str = ""
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str = ""
    smtp_password: SecretStr = SecretStr("")
    smtp_from_address: str = ""
    smtp_starttls: bool = True
    password_reset_url: str = "http://localhost:5173/reset-password"

    @model_validator(mode="after")
    def validate_security_configuration(self):
        if self.jwt_algorithm != "HS256":
            raise ValueError("Only the explicitly supported HS256 JWT algorithm is allowed")
        if len(self.jwt_signing_key.get_secret_value()) < 32:
            raise ValueError("JWT_SIGNING_KEY must contain at least 32 characters")
        if not self.jwt_signing_key_id.strip():
            raise ValueError("JWT_SIGNING_KEY_ID must not be empty")
        seen_key_ids = {self.jwt_signing_key_id}
        for entry in filter(None, (part.strip() for part in self.jwt_previous_signing_keys.split(","))):
            key_id, separator, key_value = entry.partition("=")
            if not separator or len(key_value) < 32 or not key_id.strip() or key_id in seen_key_ids:
                raise ValueError("JWT_PREVIOUS_SIGNING_KEYS must contain unique kid=secret entries with secrets of at least 32 characters")
            seen_key_ids.add(key_id)
        if self.password_hash_algorithm.lower() != "argon2id":
            raise ValueError("PASSWORD_HASH_ALGORITHM must be argon2id")
        if self.refresh_cookie_samesite not in {"lax", "strict", "none"}:
            raise ValueError("REFRESH_COOKIE_SAMESITE must be lax, strict, or none")
        if self.refresh_cookie_samesite == "none" and not self.refresh_cookie_secure:
            raise ValueError("Secure refresh cookies are required when SameSite is none")
        return self

    @property
    def email_delivery_enabled(self) -> bool:
        return bool(self.smtp_host and self.smtp_from_address)

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def verification_keys(self) -> dict[str, str]:
        keys = {self.jwt_signing_key_id: self.jwt_signing_key.get_secret_value()}
        for entry in filter(None, (part.strip() for part in self.jwt_previous_signing_keys.split(","))):
            key_id, _, key_value = entry.partition("=")
            keys[key_id] = key_value
        return keys


@lru_cache
def get_settings() -> Settings:
    return Settings()
