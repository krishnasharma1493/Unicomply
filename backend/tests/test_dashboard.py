"""Dashboard API (#36): KPIs, workload, ageing and institution table, scoped per persona (PRD §5, §7)."""

from datetime import date, timedelta
from typing import Callable, Dict, List

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlmodel import Session, col, select

from app.core.enums import CaseStatus, OverlapGroupStatus
from app.core.fixtures import load_fixture
from app.core.scope import scope_cases
from app.modules.cases.models import Case
from app.modules.dashboard import service as dashboard_service
from app.modules.overlaps.models import OverlapGroup, OverlapLink
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
ALL_PERSONAS = [SENIOR, PGRC, RB, RO, INTAKE]


@pytest.fixture(autouse=True)
def demo_today(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(dashboard_service, "today", lambda: TODAY)


def get(client: TestClient, headers: Dict[str, str], path: str) -> object:
    res = client.get(f"/api/v1/dashboard/{path}", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()["data"]


def scoped_cases(engine: Engine, email: str) -> List[Case]:
    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == email)).one()
        return list(session.exec(scope_cases(select(Case), user)).all())


# ── The senior officer sees the whole world, exactly as the contract fixtures describe it ──


@pytest.mark.parametrize(
    "path, fixture",
    [
        ("summary", "get_dashboard_summary"),
        ("workload", "get_dashboard_workload"),
        ("ageing", "get_dashboard_ageing"),
        ("institutions?limit=5", "get_dashboard_institutions"),
    ],
)
def test_senior_numbers_match_the_contract_fixtures(
    seeded_client: TestClient, auth_headers: Headers, path: str, fixture: str
) -> None:
    res = seeded_client.get(f"/api/v1/dashboard/{path}", headers=auth_headers(SENIOR))
    assert res.status_code == 200, res.text
    assert res.json() == load_fixture(fixture)


@pytest.mark.parametrize("path", ["summary", "workload", "ageing", "institutions"])
def test_a_token_is_required(seeded_client: TestClient, path: str) -> None:
    res = seeded_client.get(f"/api/v1/dashboard/{path}")
    assert res.status_code == 401 and res.json()["error"]["code"] == "UNAUTHORIZED"


# ── Numbers match direct counts, for every persona ──────────────────────────


@pytest.mark.parametrize("email", ALL_PERSONAS)
def test_summary_matches_direct_counts(
    seeded_client: TestClient, seeded_engine: Engine, auth_headers: Headers, email: str
) -> None:
    cases = scoped_cases(seeded_engine, email)
    ids = {c.id for c in cases}
    with Session(seeded_engine) as session:
        open_groups = {
            link.group_id
            for link in session.exec(select(OverlapLink)).all()
            if link.case_id in ids
            and session.get(OverlapGroup, link.group_id).status == OverlapGroupStatus.open  # type: ignore[union-attr]
        }
    expected = {
        "as_of": TODAY.isoformat(),
        "total": len(cases),
        "pending": sum(c.status != CaseStatus.disposed for c in cases),
        "under_process": sum(c.status in (CaseStatus.under_process, CaseStatus.interim_reply) for c in cases),
        "disposed": sum(c.status == CaseStatus.disposed for c in cases),
        "transferred": sum(c.status == CaseStatus.transferred for c in cases),
        "escalated": sum(c.status == CaseStatus.escalated for c in cases),
        "beyond_sla": sum(c.status != CaseStatus.disposed and c.sla_due_on < TODAY for c in cases),
        "open_overlaps": len(open_groups),
    }
    assert get(seeded_client, auth_headers(email), "summary") == expected


@pytest.mark.parametrize("email", ALL_PERSONAS)
def test_workload_matches_direct_counts(
    seeded_client: TestClient, seeded_engine: Engine, auth_headers: Headers, email: str
) -> None:
    open_cases = [c for c in scoped_cases(seeded_engine, email) if c.status != CaseStatus.disposed]
    rows = get(seeded_client, auth_headers(email), "workload")
    assert isinstance(rows, list)
    assert sum(r["open"] for r in rows) == len(open_cases)
    for row in rows:
        mine = [c for c in open_cases if c.current_bureau_id == row["bureau_id"]]
        assert row["open"] == len(mine) == sum(row["by_status"].values())
        assert row["beyond_sla"] == sum(c.sla_due_on < TODAY for c in mine)
        assert "disposed" not in row["by_status"]
    assert [r["open"] for r in rows] == sorted((r["open"] for r in rows), reverse=True)


@pytest.mark.parametrize("email", ALL_PERSONAS)
def test_ageing_matches_direct_counts(
    seeded_client: TestClient, seeded_engine: Engine, auth_headers: Headers, email: str
) -> None:
    ages = [(TODAY - c.received_at).days for c in scoped_cases(seeded_engine, email) if c.status != CaseStatus.disposed]
    rows = get(seeded_client, auth_headers(email), "ageing")
    assert isinstance(rows, list)
    assert [r["bucket"] for r in rows] == ["0_7", "8_14", "15_21", "22_45", "45_plus"]
    for row in rows:
        high = row["max_days"] if row["max_days"] is not None else 10**6
        assert row["count"] == sum(row["min_days"] <= a <= high for a in ages)
    assert sum(r["count"] for r in rows) == len(ages)


@pytest.mark.parametrize("email", ALL_PERSONAS)
def test_institutions_match_direct_counts(
    seeded_client: TestClient, seeded_engine: Engine, auth_headers: Headers, email: str
) -> None:
    cases = scoped_cases(seeded_engine, email)
    rows = get(seeded_client, auth_headers(email), "institutions?limit=100")
    assert isinstance(rows, list)
    for row in rows:
        mine = [c for c in cases if c.permanent_id == row["permanent_id"]]
        assert row["total"] == len(mine)
        assert row["open"] == sum(c.status != CaseStatus.disposed for c in mine) > 0
        assert row["beyond_sla"] == sum(c.status != CaseStatus.disposed and c.sla_due_on < TODAY for c in mine)
        assert sum(row["by_status"].values()) == len(mine)
    resolved_open = {c.permanent_id for c in cases if c.permanent_id and c.status != CaseStatus.disposed}
    assert {r["permanent_id"] for r in rows} == resolved_open
    assert [r["open"] for r in rows] == sorted((r["open"] for r in rows), reverse=True)


def test_institutions_limit(seeded_client: TestClient, auth_headers: Headers) -> None:
    rows = get(seeded_client, auth_headers(SENIOR), "institutions?limit=2")
    assert isinstance(rows, list) and len(rows) == 2
    assert [r["permanent_id"] for r in rows] == ["1-43655981521", "1-43658264742"]


@pytest.mark.parametrize("limit", ["0", "101", "abc"])
def test_institutions_limit_is_validated(seeded_client: TestClient, auth_headers: Headers, limit: str) -> None:
    res = seeded_client.get(f"/api/v1/dashboard/institutions?limit={limit}", headers=auth_headers(SENIOR))
    assert res.status_code == 400 and res.json()["error"]["code"] == "VALIDATION_ERROR"


# ── Scope: totals differ per persona ────────────────────────────────────────


def test_totals_differ_by_persona_scope(seeded_client: TestClient, auth_headers: Headers) -> None:
    totals = {e: get(seeded_client, auth_headers(e), "summary")["total"] for e in ALL_PERSONAS}  # type: ignore[index]
    assert totals[SENIOR] == 13
    assert totals[PGRC] < totals[SENIOR] and totals[RB] < totals[SENIOR]
    assert totals[PGRC] != totals[RB]


def test_bureau_head_workload_only_lists_their_bureau(seeded_client: TestClient, auth_headers: Headers) -> None:
    rows = get(seeded_client, auth_headers(PGRC), "workload")
    assert isinstance(rows, list) and [r["bureau_code"] for r in rows] == ["PGRC"]


def test_pgrc_head_does_not_see_other_bureaus_overlap_through_the_cards(
    seeded_client: TestClient, auth_headers: Headers
) -> None:
    """Counts follow `scope_cases` only: a group whose members are all out of scope is not counted."""
    senior = get(seeded_client, auth_headers(SENIOR), "summary")["open_overlaps"]  # type: ignore[index]
    pgrc = get(seeded_client, auth_headers(PGRC), "summary")["open_overlaps"]  # type: ignore[index]
    assert pgrc <= senior


# ── Ageing bucket edges ─────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "age, bucket",
    [(0, "0_7"), (7, "0_7"), (8, "8_14"), (14, "8_14"), (15, "15_21"), (21, "15_21"),
     (22, "22_45"), (45, "22_45"), (46, "45_plus"), (400, "45_plus")],
)
def test_ageing_bucket_edges(
    seeded_client: TestClient, seeded_engine: Engine, auth_headers: Headers, age: int, bucket: str
) -> None:
    with Session(seeded_engine) as session:
        for case in session.exec(select(Case)).all():
            case.status = CaseStatus.disposed
            session.add(case)
        keep = session.exec(select(Case).order_by(col(Case.id))).first()
        assert keep is not None
        keep.status, keep.received_at = CaseStatus.received, TODAY - timedelta(days=age)
        session.add(keep)
        session.commit()
    rows = get(seeded_client, auth_headers(SENIOR), "ageing")
    assert isinstance(rows, list)
    assert {r["bucket"]: r["count"] for r in rows if r["count"]} == {bucket: 1}
