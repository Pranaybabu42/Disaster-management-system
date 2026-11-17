from fastapi import HTTPException


class StructuredHTTPException(HTTPException):
    """HTTP-layer exception that keeps an application error code and source name."""

    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        exception_name: str,
        detail: str,
        headers: dict[str, str] | None = None,
    ):
        super().__init__(status_code=status_code, detail=detail, headers=headers)
        self.error_code = code
        self.exception_name = exception_name
