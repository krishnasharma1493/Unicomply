"""Standard error contract, domain exception classes, and FastAPI exception handlers."""

import logging
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.schemas import ErrorBody, ErrorDetail

logger = logging.getLogger("unicomply.errors")

_HTTP_CODES = {
    400: "INVALID_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
}


class AppError(Exception):
    """Raise anywhere: `raise AppError(404, "NOT_FOUND", "Resource not found")`."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        fields: Optional[Dict[str, List[str]]] = None,
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.fields = fields
        self.details = details


# Domain-specific exceptions per PRD §5 "Domain error codes"
class InvalidTransitionError(AppError):
    """Action not allowed from the current case status."""

    def __init__(
        self, message: str = "Invalid case state transition", details: Optional[Any] = None
    ) -> None:
        super().__init__(status.HTTP_400_BAD_REQUEST, "INVALID_TRANSITION", message, details=details)


class RemarksRequiredError(AppError):
    """transfer / escalate / dispose / reopen / dismiss without remarks."""

    def __init__(
        self, message: str = "Remarks are required for this action", details: Optional[Any] = None
    ) -> None:
        super().__init__(status.HTTP_400_BAD_REQUEST, "REMARKS_REQUIRED", message, details=details)


class OpenOverlapError(AppError):
    """Dispose on a case in an open overlap group without confirmation; details list linked case refs."""

    def __init__(
        self,
        message: str = "This case is part of an open overlap group",
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(status.HTTP_409_CONFLICT, "OPEN_OVERLAP", message, details=details)


class AlreadyDecidedError(AppError):
    """Review or overlap decision already taken."""

    def __init__(
        self, message: str = "This item has already been decided", details: Optional[Any] = None
    ) -> None:
        super().__init__(status.HTTP_409_CONFLICT, "ALREADY_DECIDED", message, details=details)


class NotFoundError(AppError):
    """Missing or out of scope (never 403 for scope)."""

    def __init__(self, message: str = "Resource not found", details: Optional[Any] = None) -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, "NOT_FOUND", message, details=details)


class ForbiddenError(AppError):
    """In scope to read but the role cannot perform this action."""

    def __init__(
        self, message: str = "Your role cannot do this", details: Optional[Any] = None
    ) -> None:
        super().__init__(status.HTTP_403_FORBIDDEN, "FORBIDDEN", message, details=details)


class UnauthorizedError(AppError):
    """Authentication credentials are missing or invalid."""

    def __init__(self, message: str = "Authentication required", details: Optional[Any] = None) -> None:
        super().__init__(status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED", message, details=details)


def error_response(
    status_code: int,
    code: str,
    message: str,
    fields: Optional[Dict[str, List[str]]] = None,
    details: Optional[Any] = None,
) -> JSONResponse:
    """Build the one error shape used for every error response."""
    body = ErrorBody(error=ErrorDetail(code=code, message=message, fields=fields, details=details))
    return JSONResponse(status_code=status_code, content=body.model_dump(exclude_none=True))


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Handler for custom application errors."""
    return error_response(exc.status_code, exc.code, exc.message, exc.fields, exc.details)


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Request validation errors → 400 VALIDATION_ERROR with per-field messages."""
    fields: Dict[str, List[str]] = {}
    for err in exc.errors():
        path = [str(p) for p in err.get("loc", []) if p not in ("body", "query", "path", "header")]
        fields.setdefault(".".join(path) or "request", []).append(err.get("msg", "Invalid value"))
    # 400 (not FastAPI's default 422) to keep the base blueprint contract
    return error_response(status.HTTP_400_BAD_REQUEST, "VALIDATION_ERROR", "Validation failed", fields)


async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    """Unique / foreign-key violations → 409 CONFLICT."""
    logger.warning("Integrity error on %s %s", request.method, request.url.path)
    return error_response(status.HTTP_409_CONFLICT, "CONFLICT", "That conflicts with existing data")


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Starlette/FastAPI HTTPExceptions, including unknown routes (404) and wrong methods (405)."""
    return error_response(
        exc.status_code, _HTTP_CODES.get(exc.status_code, "HTTP_ERROR"), str(exc.detail)
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Unexpected 500s. The trace goes to the server log only; the response never
    exposes internal traces, paths, or secrets.
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    return error_response(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "INTERNAL_ERROR",
        "Something went wrong — check the backend terminal",
    )


def register_error_handlers(app: FastAPI) -> None:
    """Register all standard error handlers on the FastAPI application."""
    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(IntegrityError, integrity_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_exception_handler)
