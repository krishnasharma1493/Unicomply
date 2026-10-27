"""Tests for application error contracts, domain exceptions, and exception sanitization."""

from typing import List

from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError

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
from app.core.schemas import Envelope, Page
from app.main import create_app


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
            400,
            "INVALID_TRANSITION",
            "Cannot transition case from disposed to under_process",
            details={"case_ref": "PGRC/2026/00412", "allowed": ["reopen", "remark"]},
        )

    @router.get("/trigger-invalid-transition-class")
    def trigger_invalid_transition_class():
        raise InvalidTransitionError()

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

    @router.get("/trigger-integrity")
    def trigger_integrity():
        raise IntegrityError("INSERT ...", {}, Exception("UNIQUE constraint failed"))

    @router.post("/trigger-validation")
    def trigger_validation(payload: SamplePayload):
        return {"received": payload.model_dump()}

    @router.get("/trigger-unexpected-500")
    def trigger_unexpected():
        raise RuntimeError("Database connection string postgresql://secret:pass@localhost:5432/db")

    app.include_router(router)
    return app


def test_app_error_invalid_transition() -> None:
    """AppError returns expected status code and structured JSON envelope."""
    client = TestClient(create_error_test_app(), raise_server_exceptions=False)

    response = client.get("/trigger-invalid-transition")
    assert response.status_code == 400

    data = response.json()
    assert data["success"] is False
    assert data["error"]["code"] == "INVALID_TRANSITION"
    assert "Cannot transition case" in data["error"]["message"]
    assert data["error"]["details"]["case_ref"] == "PGRC/2026/00412"
    assert "fields" not in data["error"]


def test_domain_error_responses() -> None:
    """Domain exceptions use the HTTP status and code from PRD §5."""
    client = TestClient(create_error_test_app(), raise_server_exceptions=False)

    expected = {
        "/trigger-invalid-transition-class": (400, "INVALID_TRANSITION"),
        "/trigger-remarks-required": (400, "REMARKS_REQUIRED"),
        "/trigger-open-overlap": (409, "OPEN_OVERLAP"),
        "/trigger-already-decided": (409, "ALREADY_DECIDED"),
        "/trigger-not-found": (404, "NOT_FOUND"),
        "/trigger-forbidden": (403, "FORBIDDEN"),
        "/trigger-integrity": (409, "CONFLICT"),
    }
    for path, (status_code, code) in expected.items():
        res = client.get(path)
        assert res.status_code == status_code, path
        assert res.json()["success"] is False
        assert res.json()["error"]["code"] == code, path

    # OPEN_OVERLAP lists the linked case refs
    assert "RB/2026/00087" in client.get("/trigger-open-overlap").json()["error"]["details"]


def test_request_validation_error_contract() -> None:
    """Validation errors → 400 VALIDATION_ERROR with per-field messages (base blueprint shape)."""
    client = TestClient(create_error_test_app(), raise_server_exceptions=False)

    response = client.post("/trigger-validation", json={"name": "Alice", "age": "not-an-int"})
    assert response.status_code == 400

    data = response.json()
    assert data["success"] is False
    assert data["error"]["code"] == "VALIDATION_ERROR"
    assert data["error"]["message"] == "Validation failed"
    assert isinstance(data["error"]["fields"]["age"], list)


def test_unknown_route_uses_standard_error_shape(client: TestClient) -> None:
    """Routing 404s and 405s use the standard shape, not FastAPI's default `{"detail": ...}`."""
    res = client.get("/api/v1/does-not-exist")
    assert res.status_code == 404
    assert res.json() == {"success": False, "error": {"code": "NOT_FOUND", "message": "Not Found"}}

    res = client.delete("/health")
    assert res.status_code == 405
    assert res.json()["error"]["code"] == "METHOD_NOT_ALLOWED"


def test_unexpected_500_does_not_leak_internals() -> None:
    """Unhandled exceptions return sanitized 500 without leaking credentials or traces."""
    client = TestClient(create_error_test_app(), raise_server_exceptions=False)

    response = client.get("/trigger-unexpected-500")
    assert response.status_code == 500

    data = response.json()
    assert data["success"] is False
    assert data["error"]["code"] == "INTERNAL_ERROR"
    assert "details" not in data["error"]
    for leaked in ("secret", "pass@", "RuntimeError", "Traceback"):
        assert leaked not in response.text


def test_real_app_500_does_not_leak_traceback() -> None:
    """The real app (create_app) also returns the sanitized JSON 500, never a debug traceback page."""
    app = create_app()

    @app.get("/boom")
    def boom():
        raise RuntimeError("postgresql://secret:pass@db")

    response = TestClient(app, raise_server_exceptions=False).get("/boom")
    assert response.status_code == 500
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
    assert "Traceback" not in response.text
    assert "secret" not in response.text


def test_envelope_and_page_shapes() -> None:
    """Envelope and Page serialise to the base blueprint contract the fixtures and TS types follow."""
    assert Envelope[dict](data={"id": 1}).model_dump() == {"success": True, "data": {"id": 1}}

    page = Page[int].create(items=[1, 2], total=45, page=2, limit=20)
    assert page.model_dump() == {
        "success": True,
        "data": [1, 2],
        "pagination": {"total": 45, "page": 2, "limit": 20, "total_pages": 3},
    }
    items: List[int] = []
    assert Page[int].create(items=items, total=0).pagination.total_pages == 0
