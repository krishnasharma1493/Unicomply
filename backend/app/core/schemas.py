"""Reusable Pydantic response envelopes, pagination, and error models."""

from typing import Any, Generic, List, Optional, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


class ErrorBody(BaseModel):
    """Standardized error payload."""

    code: str = Field(..., description="Stable machine-readable error code")
    message: str = Field(..., description="Human-readable error explanation")
    details: Optional[Any] = Field(
        default=None, description="Optional structured details, e.g. field errors"
    )


class ErrorResponse(BaseModel):
    """Standard error response envelope."""

    success: bool = Field(default=False, description="Always false for error responses")
    error: ErrorBody = Field(..., description="Structured error information")


class Pagination(BaseModel):
    """Pagination metadata for list endpoints."""

    page: int = Field(default=1, ge=1, description="Current 1-indexed page number")
    page_size: int = Field(default=20, ge=1, description="Page size limit")
    total: int = Field(default=0, ge=0, description="Total matching items count")
    total_pages: int = Field(default=0, ge=0, description="Total available pages")


class Page(BaseModel, Generic[T]):
    """Generic paginated collection."""

    items: List[T] = Field(default_factory=list, description="Paginated items")
    pagination: Pagination = Field(..., description="Pagination metadata")

    @classmethod
    def create(
        cls,
        items: List[T],
        total: int,
        page: int = 1,
        page_size: int = 20,
    ) -> "Page[T]":
        """Compute total_pages and assemble Page instance."""
        total_pages = (total + page_size - 1) // page_size if page_size > 0 else 0
        return cls(
            items=items,
            pagination=Pagination(
                page=page,
                page_size=page_size,
                total=total,
                total_pages=total_pages,
            ),
        )


class Envelope(BaseModel, Generic[T]):
    """Standard success and data envelope for API responses."""

    success: bool = Field(default=True, description="Indicates request success")
    data: Optional[T] = Field(default=None, description="Response payload")
    error: Optional[ErrorBody] = Field(
        default=None, description="Error payload when success is false"
    )

    @classmethod
    def ok(cls, data: T) -> "Envelope[T]":
        """Convenience constructor for success envelope."""
        return cls(success=True, data=data, error=None)


class HealthData(BaseModel):
    """Health check payload."""

    status: str = Field(default="ok", description="Service health status")
    timestamp: str = Field(..., description="UTC ISO-8601 timestamp")
    environment: str = Field(..., description="Current running environment")
    version: str = Field(default="0.1.0", description="Application version")
