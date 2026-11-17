from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


def normalize_email(value: str) -> str:
    return value.strip().casefold()


class CredentialsInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)
    account_type: Literal["admin", "user", "rescue_team"] | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = normalize_email(value)
        local, separator, domain = normalized.rpartition("@")
        if not separator or not local or not domain or "." not in domain or any(char.isspace() for char in normalized):
            raise ValueError("Enter a valid email address")
        return normalized


class RegisterInput(CredentialsInput):
    full_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=128)


class ForgotPasswordInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    email: str = Field(min_length=3, max_length=254)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = normalize_email(value)
        local, separator, domain = normalized.rpartition("@")
        if not separator or not local or not domain or "." not in domain or any(char.isspace() for char in normalized):
            raise ValueError("Enter a valid email address")
        return normalized


class ResetPasswordInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    token: str = Field(min_length=32, max_length=256)
    new_password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    roles: list[str]
    scopes: list[str]


class AuthResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserResponse


class SessionResponse(BaseModel):
    id: str
    created_at: datetime
    expires_at: datetime
    last_used_at: datetime | None = None
    user_agent: str | None = None
    ip_address: str | None = None


class MessageResponse(BaseModel):
    message: str
