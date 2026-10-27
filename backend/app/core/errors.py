"""Standard error contract, domain exception classes, and FastAPI exception handlers."""

import logging
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.schemas import ErrorBody, ErrorResponse

logger = logging.getLogger("unicomply.errors")


class AppError(Exception):
    """
    Base application exception with HTTP status code, domain error code,
    human-readable message, and optional structured details.
    """

    def __init__(
        self,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        code: str = "BAD_REQUEST",
        message: str = "An application error occurred",
        details: Optional[Any] = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        super().__init__(message)


# Domain-specific exceptions per PRD §5
class InvalidTransitionError(AppError):
    """Raised when an illegal workflow state transition is attempted."""

    def __init__(
        self,
        message: str = "Invalid case state transition",
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="INVALID_TRANSITION",
            message=message,
            details=details,
        )


class RemarksRequiredError(AppError):
    """Raised when an officer action requires explanatory remarks."""

    def __init__(
        self,
        message: str = "Remarks are required for this action",
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="REMARKS_REQUIRED",
            message=message,
            details=details,
        )


class OpenOverlapError(AppError):
    """Raised when a case cannot proceed due to unresolved overlapping cases."""

    def __init__(
        self,
        message: str = "Case has pending cross-bureau overlap coordination",
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="OPEN_OVERLAP",
            message=message,
            details=details,
        )


class AlreadyDecidedError(AppError):
    """Raised when attempting to decide an already resolved overlap or match."""

    def __init__(
        self,
        message: str = "This item has already been decided",
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="ALREADY_DECIDED",
            message=message,
            details=details,
        )


class NotFoundError(AppError):
    """Raised when a requested resource does not exist."""

    def __init__(
        self,
        message: str = "Resource not found",
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            code="NOT_FOUND",
            message=message,
            details=details,
        )


class ForbiddenError(AppError):
    """Raised when user lacks permission to access a resource or execute an action."""

    def __init__(
        self,
        message: str = "You do not have permission to perform this action",
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            code="FORBIDDEN",
            message=message,
            details=details,
        )


class UnauthorizedError(AppError):
    """Raised when authentication credentials are missing or invalid."""

    def __init__(
        self,
        message: str = "Authentication required",
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="UNAUTHORIZED",
            message=message,
            details=details,
        )


def _build_error_response(
    status_code: int,
    code: str,
    message: str,
    details: Optional[Any] = None,
) -> JSONResponse:
    """Helper to produce consistent JSON response for errors."""
    content = {
        "success": False,
        "error": {
            "code": code,
            "message": message,
            "details": details,
        },
    }
    return JSONResponse(status_code=status_code, content=content)


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Handler for custom application errors."""
    return _build_error_response(
        status_code=exc.status_code,
        code=exc.code,
        message=exc.message,
        details=exc.details,
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handler for FastAPI / Pydantic request validation errors."""
    sanitized_errors = []
    for err in exc.errors():
        sanitized_errors.append(
            {
                "field": ".".join(str(loc) for loc in err.get("loc", []) if loc != "body"),
                "message": err.get("msg"),
                "type": err.get("type"),
            }
        )
    status_422 = getattr(status, "HTTP_422_UNPROCESSABLE_CONTENT", 422)
    return _build_error_response(
        status_code=status_422,
        code="VALIDATION_ERROR",
        message="Request validation failed",
        details=sanitized_errors,
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Handler for standard FastAPI/Starlette HTTPExceptions."""
    status_422 = getattr(status, "HTTP_422_UNPROCESSABLE_CONTENT", 422)
    code_map = {
        status.HTTP_400_BAD_REQUEST: "BAD_REQUEST",
        status.HTTP_401_UNAUTHORIZED: "UNAUTHORIZED",
        status.HTTP_403_FORBIDDEN: "FORBIDDEN",
        status.HTTP_404_NOT_FOUND: "NOT_FOUND",
        status.HTTP_405_METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
        status.HTTP_409_CONFLICT: "CONFLICT",
        status_422: "VALIDATION_ERROR",
        status.HTTP_500_INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
    }
    code = code_map.get(exc.status_code, "HTTP_ERROR")
    return _build_error_response(
        status_code=exc.status_code,
        code=code,
        message=str(exc.detail),
        details=None,
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Handler for unexpected 500 server errors.
    Logs full exception trace internally but never exposes internal trace,
    paths, or secrets in the public HTTP response.
    """
    logger.exception(f"Unhandled exception during request {request.method} {request.url.path}: {exc}")
    return _build_error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        code="INTERNAL_SERVER_ERROR",
        message="An unexpected server error occurred",
        details=None,
    )


def register_error_handlers(app: FastAPI) -> None:
    """Register all standard error handlers on the FastAPI application."""
    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(HTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_exception_handler)  # type: ignore[arg-type]
