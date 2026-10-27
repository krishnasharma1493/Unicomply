"""Tests for application error contracts, domain exceptions, and exception sanitization."""

from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.core.config import Settings
from app.core.errors import (
    AlreadyDecidedError,
    AppError,
    ForbiddenError,
    InvalidTransitionError,
    NotFoundError,
    OpenOverlapError,
    RemarksRequiredError,
    register_error_handlers,
)


class SamplePayload(BaseModel):
    name: str
    age: int


def create_error_test_app() -> FastAPI:
    """Create test FastAPI application with routes triggering various exceptions."""
    app = FastAPI()
    register_error_handlers(app)
    router = APIRouter()

    @router.get("/trigger-invalid-transition")
    def trigger_invalid_transition():
        raise AppError(
            status_code=400,
            code="INVALID_TRANSITION",
            message="Cannot transition case from resolved to in_progress",
            details={"case_id": "PGRC/2026/00412", "allowed": ["closed"]},
        )

    @router.get("/trigger-remarks-required")
    def trigger_remarks_required():
        raise RemarksRequiredError()

    @router.get("/trigger-open-overlap")
    def trigger_open_overlap():
        raise OpenOverlapError(details=["RB/2026/00087", "RO-CRO/2026/00133"])

    @router.get("/trigger-already-decided")
    def trigger_already_decided():
        raise AlreadyDecidedError()

    @router.get("/trigger-not-found")
    def trigger_not_found():
        raise NotFoundError("Case not found")

    @router.get("/trigger-forbidden")
    def trigger_forbidden():
        raise ForbiddenError()

    @router.post("/trigger-validation")
    def trigger_validation(payload: SamplePayload):
        return {"received": payload.dict()}

    @router.get("/trigger-unexpected-500")
    def trigger_unexpected():
        raise RuntimeError("Database connection string postgresql://secret:pass@localhost:5432/db")

    app.include_router(router)
    return app


def test_app_error_invalid_transition() -> None:
    """AppError returns expected status code and structured JSON envelope."""
    app = create_error_test_app()
    client = TestClient(app, raise_server_exceptions=False)

    response = client.get("/trigger-invalid-transition")
    assert response.status_code == 400

    data = response.json()
    assert data["success"] is False
    assert data["error"]["code"] == "INVALID_TRANSITION"
    assert "Cannot transition case" in data["error"]["message"]
    assert data["error"]["details"]["case_id"] == "PGRC/2026/00412"


def test_domain_error_responses() -> None:
    """Specific domain exceptions produce expected status codes and codes."""
    app = create_error_test_app()
    client = TestClient(app, raise_server_exceptions=False)

    # REMARKS_REQUIRED
    res = client.get("/trigger-remarks-required")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "REMARKS_REQUIRED"

    # OPEN_OVERLAP
    res = client.get("/trigger-open-overlap")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "OPEN_OVERLAP"
    assert "RB/2026/00087" in res.json()["error"]["details"]

    # ALREADY_DECIDED
    res = client.get("/trigger-already-decided")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "ALREADY_DECIDED"

    # NOT_FOUND
    res = client.get("/trigger-not-found")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"

    # FORBIDDEN
    res = client.get("/trigger-forbidden")
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "FORBIDDEN"


def test_request_validation_error_contract() -> None:
    """Validation errors follow standard error shape with VALIDATION_ERROR code."""
    app = create_error_test_app()
    client = TestClient(app, raise_server_exceptions=False)

    response = client.post("/trigger-validation", json={"name": "Alice", "age": "not-an-int"})
    assert response.status_code == 422

    data = response.json()
    assert data["success"] is False
    assert data["error"]["code"] == "VALIDATION_ERROR"
    assert "validation failed" in data["error"]["message"].lower()
    assert isinstance(data["error"]["details"], list)
    assert any("age" in d.get("field", "") for d in data["error"]["details"])


def test_unexpected_500_does_not_leak_internals() -> None:
    """Unhandled exceptions return sanitized 500 without leaking credentials or traces."""
    app = create_error_test_app()
    client = TestClient(app, raise_server_exceptions=False)

    response = client.get("/trigger-unexpected-500")
    assert response.status_code == 500

    data = response.json()
    assert data["success"] is False
    assert data["error"]["code"] == "INTERNAL_SERVER_ERROR"
    assert data["error"]["message"] == "An unexpected server error occurred"
    assert data["error"]["details"] is None

    # Assert no secret or connection string was exposed in response body
    raw_text = response.text
    assert "secret" not in raw_text
    assert "pass@" not in raw_text
    assert "RuntimeError" not in raw_text
