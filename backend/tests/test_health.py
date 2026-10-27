"""Tests for health check endpoints and documentation routes."""

from fastapi.testclient import TestClient


def test_root_health_endpoint(client: TestClient) -> None:
    """GET /health returns HTTP 200 and documented response."""
    response = client.get("/health")
    assert response.status_code == 200

    payload = response.json()
    assert payload["status"] == "ok"
    assert "timestamp" in payload
    assert payload["timestamp"].endswith("Z")
    assert payload["environment"] == "test"
    assert payload["version"] == "0.1.0"


def test_api_v1_health_endpoint(client: TestClient) -> None:
    """GET /api/v1/health returns HTTP 200 and matches contract."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200

    payload = response.json()
    assert payload["status"] == "ok"
    assert "timestamp" in payload
    assert payload["timestamp"].endswith("Z")
    assert payload["environment"] == "test"
    assert payload["version"] == "0.1.0"


def test_docs_and_openapi_load(client: TestClient) -> None:
    """Swagger UI /docs and OpenAPI JSON spec are accessible."""
    docs_res = client.get("/docs")
    assert docs_res.status_code == 200

    openapi_res = client.get("/openapi.json")
    assert openapi_res.status_code == 200
    spec = openapi_res.json()
    assert "/health" in spec["paths"]
    assert "/api/v1/health" in spec["paths"]
