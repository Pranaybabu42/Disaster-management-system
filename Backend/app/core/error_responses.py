from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class ErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[False] = False
    status_code: int
    status: Literal["error"] = "error"
    code: str
    exception_name: str
    message: str
    details: list[dict[str, Any]] | None = None
