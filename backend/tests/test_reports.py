"""Reports API (#37): every kind as JSON and CSV, scoped per persona and period (PRD §5, §12.4)."""

import csv
import io
from datetime import date
from typing import Any, Callable, Dict, List

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.core.enums import CaseStatus
from app.core.fixtures import load_fixture
from app.core.scope import scope_cases
from app.modules.cases.models import Case
from app.modules.reports import service as reports_service
from app.modules.reports.schemas import ReportKind
from app.modules.users.models import User

Headers = Callable[[str], Dict[str, str]]
SENIOR, PGRC, RB, RO, INTAKE = (
    "senior@aicte.example",
    "pgrc.head@aicte.example",
    "rb.head@aicte.example",
    "ro.nw@aicte.example",
    "intake@aicte.example",
)
TODAY = date(2026, 11, 20)  # what the tiny seed and the contract fixtures are dated for
KINDS = list(ReportKind.__args__)  # type: ignore[attr-defined]


@pytest.fixture(autouse=True)
def demo_today(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(reports_service, "today", lambda: TODAY)


def report(client: TestClient, headers: Dict[str, str], kind: str, query: str = "") -> Dict[str, Any]:
    res = client.get(f"/api/v1/reports/{kind}?{query}", headers=headers)
    assert res.status_code == 200, res.text
    data: Dict[str, Any] = res.json()["data"]
    return data


def scoped_cases(engine: Engine, email: str) -> List[Case]:
    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == email)).one()
        return list(session.exec(scope_cases(select(Case), user)).all())


# ── The senior officer's reports are the contract fixtures ──────────────────


@pytest.mark.parametrize("kind", KINDS)
def test_every_kind_returns_the_fixture_rows(seeded_client: TestClient, auth_headers: Headers, kind: str) -> None:
    got = report(seeded_client, auth_headers(SENIOR), kind)
    want = load_fixture(f"get_reports_{kind}")["data"]
    assert got.pop("generated_at") and want.pop("generated_at")
    if kind == "institution":  # the fixture's row order is hand-written; ours is busiest first
        key = lambda r: r["permanent_id"]  # noqa: E731
        got["rows"], want["rows"] = sorted(got["rows"], key=key), sorted(want["rows"], key=key)
    assert got == want


@pytest.mark.parametrize("kind", KINDS)
def test_default_period_is_the_last_three_months(seeded_client: TestClient, auth_headers: Headers, kind: str) -> None:
    got = report(seeded_client, auth_headers(SENIOR), kind)
    assert (got["from"], got["to"]) == ("2026-09-01", "2026-11-20")


@pytest.mark.parametrize("kind", KINDS)
def test_csv_has_a_header_and_the_json_rows(seeded_client: TestClient, auth_headers: Headers, kind: str) -> None:
    headers = auth_headers(SENIOR)
    as_json = report(seeded_client, headers, kind)
    res = seeded_client.get(f"/api/v1/reports/{kind}?format=csv", headers=headers)
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/csv")
    assert f"unicomply-{kind}-2026-09-01-2026-11-20.csv" in res.headers["content-disposition"]
    lines = list(csv.reader(io.StringIO(res.text)))
    assert lines[0] == [c["label"] for c in as_json["columns"]]
    assert len(lines) == 1 + len(as_json["rows"])
    keys = [c["key"] for c in as_json["columns"]]
    for line, row in zip(lines[1:], as_json["rows"]):
        assert line == ["" if row[k] is None else str(row[k]) for k in keys]


# ── Access ──────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("email", [RO, INTAKE])
@pytest.mark.parametrize("kind", KINDS)
def test_ro_officer_and_intake_operator_get_403(
    seeded_client: TestClient, auth_headers: Headers, email: str, kind: str
) -> None:
    for query in ("", "format=csv"):
        res = seeded_client.get(f"/api/v1/reports/{kind}?{query}", headers=auth_headers(email))
        assert res.status_code == 403 and res.json()["error"]["code"] == "FORBIDDEN"


@pytest.mark.parametrize("email", [SENIOR, PGRC, RB])
def test_senior_and_heads_may_read(seeded_client: TestClient, auth_headers: Headers, email: str) -> None:
    assert seeded_client.get("/api/v1/reports/status", headers=auth_headers(email)).status_code == 200


def test_a_token_is_required(seeded_client: TestClient) -> None:
    res = seeded_client.get("/api/v1/reports/status")
    assert res.status_code == 401 and res.json()["error"]["code"] == "UNAUTHORIZED"


# ── Scope: a head's report only counts the cases they may open ───────────────


@pytest.mark.parametrize("email", [SENIOR, PGRC, RB])
def test_bureau_report_matches_direct_counts(
    seeded_client: TestClient, seeded_engine: Engine, auth_headers: Headers, email: str
) -> None:
    cases = scoped_cases(seeded_engine, email)
    got = report(seeded_client, auth_headers(email), "bureau")
    assert got["totals"] == {
        "total": len(cases),
        "open": sum(c.status != CaseStatus.disposed for c in cases),
        "disposed": sum(c.status == CaseStatus.disposed for c in cases),
        "beyond_sla": sum(c.status != CaseStatus.disposed and c.sla_due_on < TODAY for c in cases),
    }
    assert sum(r["total"] for r in got["rows"]) == len(cases)


def test_a_bureau_heads_reports_cover_only_their_bureau(seeded_client: TestClient, auth_headers: Headers) -> None:
    headers = auth_headers(PGRC)
    assert [r["bureau_code"] for r in report(seeded_client, headers, "bureau")["rows"]] == ["PGRC"]
    assert [r["bureau_code"] for r in report(seeded_client, headers, "disposal_rate")["rows"]] == ["PGRC"]
    assert report(seeded_client, headers, "status")["totals"]["count"] == 6
    assert report(seeded_client, headers, "periodic")["totals"]["received"] == 6


# ── Period ──────────────────────────────────────────────────────────────────


def test_period_filters_on_received_date(seeded_client: TestClient, auth_headers: Headers) -> None:
    got = report(seeded_client, auth_headers(SENIOR), "status", "from=2026-11-01&to=2026-11-20")
    assert got["totals"]["count"] == 7 and (got["from"], got["to"]) == ("2026-11-01", "2026-11-20")
    assert report(seeded_client, auth_headers(SENIOR), "status", "from=2026-01-01&to=2026-01-31")["totals"]["count"] == 0


def test_periodic_months_include_empty_ones(seeded_client: TestClient, auth_headers: Headers) -> None:
    got = report(seeded_client, auth_headers(SENIOR), "periodic", "from=2026-08-15&to=2026-11-20")
    assert [r["period"] for r in got["rows"]] == ["2026-08", "2026-09", "2026-10", "2026-11"]
    assert got["rows"][0] == {"period": "2026-08", "received": 0, "disposed": 0, "reopened": 0}


def test_periodic_quarters(seeded_client: TestClient, auth_headers: Headers) -> None:
    got = report(seeded_client, auth_headers(SENIOR), "periodic", "group_by=quarter&from=2026-07-01&to=2026-11-20")
    assert got["group_by"] == "quarter" and got["columns"][0]["label"] == "Quarter"
    assert got["rows"] == [
        {"period": "2026-Q3", "received": 1, "disposed": 0, "reopened": 0},
        {"period": "2026-Q4", "received": 12, "disposed": 2, "reopened": 1},
    ]


def test_disposal_and_reopen_rates_are_null_without_data(seeded_client: TestClient, auth_headers: Headers) -> None:
    for kind in ("disposal_rate", "reopen_rate"):
        got = report(seeded_client, auth_headers(SENIOR), kind, "from=2026-01-01&to=2026-01-31")
        assert got["rows"] == [] and got["totals"][kind] is None


# ── Validation ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "kind, query, field",
    [
        ("status", "from=2026-11-20&to=2026-11-01", "from"),
        ("status", "from=not-a-date", "from"),
        ("periodic", "group_by=week", "group_by"),
        ("status", "format=xlsx", "format"),
        ("salary", "", "kind"),
    ],
)
def test_bad_input_is_a_400(
    seeded_client: TestClient, auth_headers: Headers, kind: str, query: str, field: str
) -> None:
    res = seeded_client.get(f"/api/v1/reports/{kind}?{query}", headers=auth_headers(SENIOR))
    assert res.status_code == 400, res.text
    assert field in res.json()["error"]["fields"]
