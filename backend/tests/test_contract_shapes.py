"""
Contract drift check (#41): the REAL endpoints, on the seeded world, against the contract fixtures the frontend was
built on. Values may differ; the shape must not: every field path the fixture has, the response has, and the other
way round, so a field the UI reads can never silently disappear or be renamed.
"""

from typing import Any, Callable, Dict, List, Set, Tuple

import pytest
from fastapi.testclient import TestClient

from app.core.fixtures import load_fixture

Headers = Callable[[str], Dict[str, str]]


def paths(value: Any, prefix: str = "") -> Set[str]:
    """Field paths, with every list element merged ([]) and null recorded, so shape not content is compared."""
    if isinstance(value, dict):
        out: Set[str] = set()
        for key, child in value.items():
            out |= paths(child, f"{prefix}.{key}" if prefix else key)
        return out or {f"{prefix}:{{}}"}
    if isinstance(value, list):
        out = {f"{prefix}[]"}
        for child in value:
            out |= paths(child, f"{prefix}[]")
        return out
    return {prefix}


def nullable(value: Any, prefix: str = "") -> Set[str]:
    """Paths that were null in this sample."""
    out: Set[str] = set()
    if value is None:
        return {prefix}
    if isinstance(value, dict):
        for key, child in value.items():
            out |= nullable(child, f"{prefix}.{key}" if prefix else key)
    if isinstance(value, list):
        for child in value:
            out |= nullable(child, f"{prefix}[]")
    return out


SENIOR, PGRC, RB, INTAKE = "senior@aicte.example", "pgrc.head@aicte.example", "rb.head@aicte.example", "intake@aicte.example"

# (url, fixture, persona). Same persona and data as the fixture was captured with.
READS: List[Tuple[str, str, str]] = [
    ("/api/v1/meta", "get_meta", SENIOR),
    ("/api/v1/users/me", "get_users_me_senior", SENIOR),
    ("/api/v1/cases?limit=20", "get_cases", SENIOR),
    ("/api/v1/cases/101", "get_cases_id", SENIOR),
    ("/api/v1/institutions?q=vviet", "get_institutions", SENIOR),
    ("/api/v1/institutions/1-4812730561", "get_institutions_permanent_id", SENIOR),
    ("/api/v1/overlaps", "get_overlaps", SENIOR),
    ("/api/v1/overlaps/1", "get_overlaps_id", SENIOR),
    ("/api/v1/alerts", "get_alerts", RB),
    ("/api/v1/reviews?status=pending", "get_reviews", INTAKE),
    ("/api/v1/dashboard/summary", "get_dashboard_summary", SENIOR),
    ("/api/v1/dashboard/workload", "get_dashboard_workload", SENIOR),
    ("/api/v1/dashboard/ageing", "get_dashboard_ageing", SENIOR),
    ("/api/v1/dashboard/institutions?limit=5", "get_dashboard_institutions", SENIOR),
    *[(f"/api/v1/reports/{k}", f"get_reports_{k}", SENIOR) for k in ("bureau", "region", "institution", "status", "ageing", "disposal_rate", "reopen_rate", "overlaps", "periodic")],
]


@pytest.mark.parametrize("url, fixture, persona", READS, ids=[r[1] for r in READS])
def test_real_response_has_the_fixtures_shape(seeded_client: TestClient, auth_headers: Headers, url: str, fixture: str, persona: str) -> None:
    res = seeded_client.get(url, headers=auth_headers(persona))
    assert res.status_code == 200, res.text
    real, expected = res.json(), load_fixture(fixture)
    missing, extra = sorted(paths(expected) - paths(real)), sorted(paths(real) - paths(expected))
    assert not missing and not extra, f"{fixture}: the UI reads {missing}; the API also sends {extra}"
    # A field the fixture shows as always present must not come back null (the TS type says it cannot).
    surprising = sorted(nullable(real) - nullable(expected))
    assert not surprising, f"{fixture}: null where the contract has a value: {surprising}"


@pytest.mark.parametrize("url", ["/api/v1/institutions/1-4812730561", "/api/v1/overlaps/1"])
def test_summary_cards_never_carry_free_text_or_names(seeded_client: TestClient, auth_headers: Headers, url: str) -> None:
    """PRD §4.2: even a viewer who may open the case gets the reduced card here, never the description or complainant."""
    body = seeded_client.get(url, headers=auth_headers(SENIOR)).text
    assert '"description"' not in body and '"complainant_name"' not in body and '"complainant_type"' not in body
    for secret in ("Sushila", "withdrew from the B.Tech programme", "faculty-student ratio"):
        assert secret not in body


# ── Writes: the same check for what the forms send and get back ──────────

WRITES: List[Tuple[str, str, str, str]] = [
    # (url, request fixture, response fixture, persona)
    ("/api/v1/cases", "requests/post_cases", "post_cases", INTAKE),
    ("/api/v1/institutions/resolve", "requests/post_institutions_resolve", "post_institutions_resolve", INTAKE),
    ("/api/v1/cases/103/actions", "requests/post_cases_id_actions", "post_cases_id_actions", "ro.central@aicte.example"),
    ("/api/v1/reviews/2/decide", "requests/post_reviews_id_decide", "post_reviews_id_decide", INTAKE),
    ("/api/v1/overlaps/1/decision", "requests/post_overlaps_id_decision", "post_overlaps_id_decision", PGRC),
]


def compare(real: Any, expected: Any, name: str) -> None:
    """Shape only: a write changes data, so a field the fixture happens to show filled may legitimately be null."""
    missing, extra = sorted(paths(expected) - paths(real)), sorted(paths(real) - paths(expected))
    assert not missing and not extra, f"{name}: the UI reads {missing}; the API also sends {extra}"


@pytest.mark.parametrize("url, request_fixture, response_fixture, persona", WRITES, ids=[w[2] for w in WRITES])
def test_write_response_has_the_fixtures_shape(
    seeded_client: TestClient, auth_headers: Headers, url: str, request_fixture: str, response_fixture: str, persona: str
) -> None:
    res = seeded_client.post(url, json=load_fixture(request_fixture), headers=auth_headers(persona))
    assert res.status_code in (200, 201), res.text
    compare(res.json(), load_fixture(response_fixture), response_fixture)


@pytest.mark.parametrize("url, request_fixture, response_fixture", [
    ("/api/v1/cases", "requests/post_cases", "post_cases"),
    ("/api/v1/institutions/resolve", "requests/post_institutions_resolve", "post_institutions_resolve"),
], ids=["post_cases", "post_institutions_resolve"])
def test_the_real_engine_answers_in_the_same_shape(full_client: TestClient, url: str, request_fixture: str, response_fixture: str) -> None:
    """The intake form and its live panel read the same fields whichever engine is behind them."""
    from tests.conftest import DEMO_PASSWORD

    token = full_client.post("/api/v1/auth/login", json={"email": INTAKE, "password": DEMO_PASSWORD}).json()["data"]["access_token"]
    res = full_client.post(url, json=load_fixture(request_fixture), headers={"Authorization": f"Bearer {token}"})
    assert res.status_code in (200, 201), res.text
    compare(res.json(), load_fixture(response_fixture), response_fixture)


def test_alert_reads_have_the_fixtures_shape(seeded_client: TestClient, auth_headers: Headers) -> None:
    h = auth_headers(RB)
    compare(seeded_client.post("/api/v1/alerts/502/read", headers=h).json(), load_fixture("post_alerts_id_read"), "post_alerts_id_read")
    compare(seeded_client.post("/api/v1/alerts/read-all", headers=h).json(), load_fixture("post_alerts_read_all"), "post_alerts_read_all")
