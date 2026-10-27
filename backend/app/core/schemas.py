"""Reusable Pydantic response envelopes, pagination, and error models (base blueprint §4)."""

from typing import Any, Dict, Generic, List, Literal, Optional, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Envelope(BaseModel, Generic[T]):
    """Standard success envelope: `{"success": true, "data": ...}`."""

    success: Literal[True] = True
    data: T


class Pagination(BaseModel):
    """Pagination metadata for list endpoints (`?page&limit`, limit max 100)."""

    total: int = Field(..., ge=0, description="Total matching items count")
    page: int = Field(..., ge=1, description="Current 1-indexed page number")
    limit: int = Field(..., ge=1, le=100, description="Page size")
    total_pages: int = Field(..., ge=0, description="Total available pages")


class Page(BaseModel, Generic[T]):
    """Paginated success envelope: `{"success": true, "data": [...], "pagination": {...}}`."""

    success: Literal[True] = True
    data: List[T]
    pagination: Pagination

    @classmethod
    def create(cls, items: List[T], total: int, page: int = 1, limit: int = 20) -> "Page[T]":
        """Compute total_pages and assemble a Page."""
        total_pages = (total + limit - 1) // limit if limit > 0 else 0
        return cls(
            data=items,
            pagination=Pagination(total=total, page=page, limit=limit, total_pages=total_pages),
        )


class ErrorDetail(BaseModel):
    """Error payload. `fields` only on VALIDATION_ERROR; `details` only when a domain error needs it."""

    code: str = Field(..., description="Stable machine-readable error code")
    message: str = Field(..., description="Human-readable message, shown to the user as-is")
    fields: Optional[Dict[str, List[str]]] = Field(
        default=None, description="Field name -> messages, only on VALIDATION_ERROR"
    )
    details: Optional[Any] = Field(
        default=None, description="Structured extra data, e.g. linked case refs for OPEN_OVERLAP"
    )


class ErrorBody(BaseModel):
    """Standard error envelope: `{"success": false, "error": {...}}`."""

    success: Literal[False] = False
    error: ErrorDetail


class PageParams(BaseModel):
    """`?page=1&limit=20` on every list endpoint (limit max 100)."""

    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)


_ERROR_DESCRIPTIONS = {
    400: "Validation error, INVALID_TRANSITION or REMARKS_REQUIRED",
    401: "Missing, invalid or expired access token",
    403: "In scope to read, but this role cannot do this (FORBIDDEN)",
    404: "Not found, or out of the caller's scope (never 403 for scope)",
    409: "OPEN_OVERLAP, ALREADY_DECIDED or CONFLICT",
}


def error_responses(*status_codes: int) -> Dict[int | str, Dict[str, Any]]:
    """`responses=` for a route: documents each error status with the standard error body in /docs."""
    return {
        code: {"model": ErrorBody, "description": _ERROR_DESCRIPTIONS[code]} for code in status_codes
    }


class HealthData(BaseModel):
    """Health check payload."""

    status: str = Field(default="ok", description="Service health status")
    timestamp: str = Field(..., description="UTC ISO-8601 timestamp")
    environment: str = Field(..., description="Current running environment")
    version: str = Field(default="0.1.0", description="Application version")
