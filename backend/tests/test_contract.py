"""
The API contract (#7): every contract fixture (#2) is a valid instance of its Pydantic model,
round-trips unchanged, and every §5 endpoint serves it through real auth with documented errors.
"""

from typing import Any, Callable, Dict, List

import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter

from app.core.fixtures import CONTRACT_DIR, load_fixture
from app.core.schemas import Envelope, ErrorBody, HealthData, Page
from app.modules.alerts.schemas import AlertRead, ReadAllResult
from app.modules.auth.schemas import LoginIn, LoginOut
from app.modules.cases.schemas import (
    CaseActionIn,
    CaseActionResult,
    CaseCreate,
    CaseDetail,
    CaseIntakeResult,
    CategorySuggestion,
    CaseRead,
    OpenOverlapErrorDetails,
)
from app.modules.dashboard.schemas import AgeingBucket, DashboardSummary, InstitutionStatusRow, WorkloadRow
from app.modules.institutions.schemas import Institution360, InstitutionListItem, ResolvePreviewIn, Resolution
from app.modules.meta.schemas import Meta
from app.modules.overlaps.schemas import OverlapDecisionIn, OverlapGroupDetail, OverlapGroupListItem
from app.modules.reports.schemas import AnyReport
from app.modules.reviews.schemas import ReviewDecideIn, ReviewDecideResult, ReviewItem
from app.modules.users.schemas import UserRead

PERSONAS = ["senior", "pgrc_head", "rb_head", "ro_nw", "intake"]
REPORT_KINDS = [
    "bureau", "region", "institution", "status", "ageing", "disposal_rate", "reopen_rate", "overlaps", "periodic",
]

# fixture name → the type it must be an instance of
RESPONSES: Dict[str, Any] = {
    "get_health": HealthData,
    "get_meta": Envelope[Meta],
    "get_institutions": Page[InstitutionListItem],
    "get_institutions_permanent_id": Envelope[Institution360],
    "post_institutions_resolve": Envelope[Resolution],
    "get_cases": Page[CaseRead],
    "post_cases": Envelope[CaseIntakeResult],
    "get_cases_id": Envelope[CaseDetail],
    "post_cases_id_actions": Envelope[CaseActionResult],
    "get_reviews": Page[ReviewItem],
    "post_reviews_id_decide": Envelope[ReviewDecideResult],
    "get_overlaps": Page[OverlapGroupListItem],
    "get_overlaps_id": Envelope[OverlapGroupDetail],
    "post_overlaps_id_decision": Envelope[OverlapGroupDetail],
    "get_alerts": Page[AlertRead],
    "post_alerts_id_read": Envelope[AlertRead],
    "post_cases_id_classify": Envelope[CategorySuggestion],
    "post_alerts_read_all": Envelope[ReadAllResult],
    "get_dashboard_summary": Envelope[DashboardSummary],
    "get_dashboard_workload": Envelope[List[WorkloadRow]],
    "get_dashboard_ageing": Envelope[List[AgeingBucket]],
    "get_dashboard_institutions": Envelope[List[InstitutionStatusRow]],
    "post_demo_reset": Envelope[Dict[str, str]],
    **{f"post_auth_login_{p}": Envelope[LoginOut] for p in PERSONAS},
    **{f"get_users_me_{p}": Envelope[UserRead] for p in PERSONAS},
    **{f"get_reports_{k}": Envelope[AnyReport] for k in REPORT_KINDS},
}
REQUESTS: Dict[str, Any] = {
    "requests/post_auth_login": LoginIn,
    "requests/post_cases": CaseCreate,
    "requests/post_cases_id_actions": CaseActionIn,
    "requests/post_institutions_resolve": ResolvePreviewIn,
    "requests/post_overlaps_id_decision": OverlapDecisionIn,
    "requests/post_reviews_id_decide": ReviewDecideIn,
}
ERRORS = [p.stem for p in (CONTRACT_DIR / "errors").glob("*.json")]


def all_fixture_names() -> List[str]:
    return sorted(str(p.relative_to(CONTRACT_DIR).with_suffix("")) for p in CONTRACT_DIR.rglob("*.json"))


def test_every_fixture_has_a_model() -> None:
    mapped = set(RESPONSES) | set(REQUESTS) | {f"errors/{e}" for e in ERRORS}
    assert set(all_fixture_names()) == mapped


def round_trip(type_: Any, data: Any, exclude_none: bool = False) -> Any:
    adapter: TypeAdapter[Any] = TypeAdapter(type_)
    value = adapter.validate_python(data)
    return adapter.dump_python(value, mode="json", by_alias=True, exclude_none=exclude_none)


@pytest.mark.parametrize("name", sorted(RESPONSES))
def test_response_fixture_round_trips(name: str) -> None:
    """Validates and serialises back to exactly the fixture: no missing, extra or retyped fields."""
    data = load_fixture(name)
    assert round_trip(RESPONSES[name], data) == data


@pytest.mark.parametrize("name", sorted(REQUESTS))
def test_request_fixture_validates(name: str) -> None:
    data = load_fixture(name)
    if name == "requests/post_auth_login":
        data = {**data, "password": "a-password"}  # the fixture holds a <DEMO_PASSWORD> placeholder
    dumped = round_trip(REQUESTS[name], data)
    assert {k: v for k, v in dumped.items() if k in data} == data


@pytest.mark.parametrize("name", sorted(ERRORS))
def test_error_fixture_round_trips(name: str) -> None:
    data = load_fixture(f"errors/{name}")
    assert round_trip(ErrorBody, data, exclude_none=True) == data


def test_open_overlap_details_shape() -> None:
    OpenOverlapErrorDetails.model_validate(load_fixture("errors/open_overlap")["error"]["details"])


# ── Endpoints ────────────────────────────────────────────────────────────────
# Every §5 endpoint is real: tests/test_cases_api.py, test_workflow.py, test_alerts.py, test_dashboard.py,
# test_reports.py and friends check the numbers; the tests below check validation and the published docs.


@pytest.mark.parametrize(
    "method, path, body, field",
    [
        ("GET", "/api/v1/cases?limit=500", None, "limit"),
        ("GET", "/api/v1/cases?status=weird", None, "status"),
        ("GET", "/api/v1/institutions/MAIT", None, "permanent_id"),
        ("GET", "/api/v1/reports/salary", None, "kind"),
        ("POST", "/api/v1/cases", {**load_fixture("requests/post_cases"), "permanent_id": "2-48"}, "permanent_id"),
        ("POST", "/api/v1/overlaps/1/decision", {"decision": "confirm", "remark": "no coordinator"}, "confirm.coordinator_id"),
        ("POST", "/api/v1/reviews/2/decide", {"permanent_id": "1-43674307362", "none": True}, None),
    ],
)
def test_invalid_input_is_a_400_validation_error(
    seeded_client: TestClient, auth_headers: Callable[[str], Dict[str, str]],
    method: str, path: str, body: Any, field: Any,
) -> None:
    res = seeded_client.request(method, path, json=body, headers=auth_headers("senior@aicte.example"))
    assert res.status_code == 400, res.text
    error = res.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    if field:
        assert field in error["fields"], error["fields"]


def test_docs_list_every_endpoint_with_models_and_errors(seeded_client: TestClient) -> None:
    spec = seeded_client.get("/openapi.json").json()
    paths = spec["paths"]
    expected = {
        ("post", "/api/v1/auth/login"), ("get", "/api/v1/users/me"), ("post", "/api/v1/demo/reset"),
        ("get", "/api/v1/reports/{kind}"),
        ("get", "/api/v1/dashboard/summary"), ("get", "/api/v1/dashboard/workload"),
        ("get", "/api/v1/dashboard/ageing"), ("get", "/api/v1/dashboard/institutions"),
    }
    normalised = {
        "/api/v1/institutions/1-43655981521": "/api/v1/institutions/{permanent_id}",
        "/api/v1/cases/101": "/api/v1/cases/{case_id}",
        "/api/v1/cases/103/actions": "/api/v1/cases/{case_id}/actions",
        "/api/v1/reviews/2/decide": "/api/v1/reviews/{review_id}/decide",
        "/api/v1/overlaps/1": "/api/v1/overlaps/{group_id}",
        "/api/v1/overlaps/1/decision": "/api/v1/overlaps/{group_id}/decision",
        "/api/v1/alerts/502/read": "/api/v1/alerts/{alert_id}/read",
    }
    expected = {(m, normalised.get(p, p)) for m, p in expected}
    for method, path in sorted(expected):
        operation = paths[path][method]
        responses = operation["responses"]
        success = responses.get("200") or responses["201"]
        assert "$ref" in str(success["content"]["application/json"]["schema"]), (method, path)
        assert "401" in responses or path == "/api/v1/auth/login", (method, path)
        assert "422" not in responses, (method, path)
        if method == "post" and path not in {"/api/v1/demo/reset", "/api/v1/alerts/read-all"} and not path.endswith("/read"):
            assert "requestBody" in operation, (method, path)
    assert ("400" in paths["/api/v1/cases/{case_id}/actions"]["post"]["responses"]
            and "409" in paths["/api/v1/cases/{case_id}/actions"]["post"]["responses"])
