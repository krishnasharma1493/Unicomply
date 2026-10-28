"""Scoping and permissions (#12, PRD §4.2) over the seeded demo world."""

from typing import Iterator, List, Set

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core import scope
from app.core.config import get_settings
from app.core.db import get_session
from app.core.deps import CurrentUser
from app.core.enums import ActionType, Role
from app.core.errors import AppError, register_error_handlers
from app.core.security import create_access_token
from app.modules.cases.models import Case
from app.modules.engine.builders import linked_case_card
from app.modules.users.models import User


@pytest.fixture(name="db")
def seeded_session(seeded_engine) -> Iterator[Session]:
    with Session(seeded_engine) as session:
        yield session


def user(db: Session, email: str) -> User:
    return db.exec(select(User).where(User.email == email)).one()


def refs(db: Session, who: User) -> List[str]:
    stmt = scope.scope_cases(select(Case), who).order_by(Case.id)
    return [c.case_ref for c in db.exec(stmt).all()]


# ── scope_cases ──────────────────────────────────────────────────────────


def test_senior_sees_everything(db: Session) -> None:
    assert len(refs(db, user(db, "senior@aicte.example"))) == 13


def test_pgrc_head_sees_only_pgrc_cases(db: Session) -> None:
    got = refs(db, user(db, "pgrc.head@aicte.example"))
    assert got and all(r.startswith("PGRC/") for r in got)
    assert "PGRC/2026/00412" in got and "RB/2026/00087" not in got


def test_rb_head_sees_only_rb_cases(db: Session) -> None:
    got = refs(db, user(db, "rb.head@aicte.example"))
    assert "RB/2026/00087" in got and "PGRC/2026/00412" not in got
    bureau = user(db, "rb.head@aicte.example").bureau_id
    assert {c.current_bureau_id for c in db.exec(select(Case).where(Case.id.in_(
        [c.id for c in db.exec(scope.scope_cases(select(Case), user(db, "rb.head@aicte.example"))).all()]))).all()} == {bureau}


def test_central_ro_sees_only_central_region_institutions_across_bureaus(db: Session) -> None:
    got = refs(db, user(db, "ro.central@aicte.example"))
    assert {"PGRC/2026/00412", "RB/2026/00087", "RO-CRO/2026/00133"} <= set(got)  # any bureau
    assert "RO-WRO/2026/00204" not in got and "PGRC/2026/00377" not in got  # western institution
    assert "PGRC/2026/00431" not in got  # unresolved: no institution, no region


def test_intake_sees_only_cases_they_created(db: Session) -> None:
    who = user(db, "intake@aicte.example")
    stmt = scope.scope_cases(select(Case), who)
    cases = db.exec(stmt).all()
    assert cases and all(c.created_by == who.id for c in cases)


def test_roles_without_case_access_and_regionless_ro_see_nothing(db: Session) -> None:
    officer = user(db, "sunita.mishra@aicte.example")
    assert officer.role == Role.case_officer and refs(db, officer) == []
    ro = user(db, "ro.central@aicte.example")
    ro.region = None
    assert refs(db, ro) == []


# ── by-id loader and role gate ───────────────────────────────────────────


def test_out_of_scope_id_is_404_not_found(db: Session) -> None:
    pgrc = user(db, "pgrc.head@aicte.example")
    rb_case = db.exec(select(Case).where(Case.case_ref == "RB/2026/00087")).one()
    with pytest.raises(AppError) as err:
        scope.get_case_in_scope_or_404(db, rb_case.id, pgrc)  # type: ignore[arg-type]
    assert (err.value.status_code, err.value.code) == (404, "NOT_FOUND")
    with pytest.raises(AppError) as missing:
        scope.get_case_in_scope_or_404(db, 99999, pgrc)
    assert missing.value.status_code == 404 and missing.value.message == err.value.message
    mine = db.exec(select(Case).where(Case.case_ref == "PGRC/2026/00412")).one()
    assert scope.get_case_in_scope_or_404(db, mine.id, pgrc).id == mine.id  # type: ignore[arg-type]


@pytest.fixture(name="probe")
def probe_client(db, test_settings) -> Iterator[TestClient]:
    """A throwaway app wiring the helpers into routes, as #13–#18 will."""
    app = FastAPI()
    register_error_handlers(app)

    def session_dep() -> Iterator[Session]:
        yield db  # one connection backs the in-memory DB: share the test's session

    app.dependency_overrides[get_session] = session_dep
    app.dependency_overrides[get_settings] = lambda: test_settings

    @app.get("/cases/{case_id}")
    def read(case_id: int, who: CurrentUser, s: Session = Depends(get_session)) -> dict:
        return {"ref": scope.get_case_in_scope_or_404(s, case_id, who).case_ref}

    @app.post("/cases/{case_id}/act")
    def act(case_id: int, who: CurrentUser, s: Session = Depends(get_session)) -> dict:
        scope.require_can_act(who, scope.get_case_in_scope_or_404(s, case_id, who), ActionType.transfer)
        return {"ok": True}

    @app.post("/reviews/decide")
    def decide(who: User = scope.require_roles(Role.intake_operator)) -> dict:
        return {"by": who.email}

    with TestClient(app) as client:
        yield client


def headers(db: Session, settings, email: str) -> dict:
    return {"Authorization": f"Bearer {create_access_token(user(db, email).id, settings)}"}  # type: ignore[arg-type]


def case_id(db: Session, ref: str) -> int:
    return db.exec(select(Case).where(Case.case_ref == ref)).one().id  # type: ignore[return-value]


def test_http_out_of_scope_is_404_and_wrong_role_is_403(probe: TestClient, db: Session, test_settings) -> None:
    pgrc = headers(db, test_settings, "pgrc.head@aicte.example")
    rb_case = case_id(db, "RB/2026/00087")
    body = probe.get(f"/cases/{rb_case}", headers=pgrc)
    assert body.status_code == 404 and body.json()["error"]["code"] == "NOT_FOUND"

    forbidden = probe.post("/reviews/decide", headers=pgrc)
    assert forbidden.status_code == 403 and forbidden.json()["error"]["code"] == "FORBIDDEN"
    ok = probe.post("/reviews/decide", headers=headers(db, test_settings, "intake@aicte.example"))
    assert ok.status_code == 200


def test_in_scope_but_cannot_act_is_403(probe: TestClient, db: Session, test_settings) -> None:
    """The central RO sees every central-region case but acts only where the case is at its own RO."""
    ro = headers(db, test_settings, "ro.central@aicte.example")
    assert probe.get(f"/cases/{case_id(db, 'PGRC/2026/00412')}", headers=ro).status_code == 200
    denied = probe.post(f"/cases/{case_id(db, 'PGRC/2026/00412')}/act", headers=ro)
    assert (denied.status_code, denied.json()["error"]["code"]) == (403, "FORBIDDEN")
    assert probe.post(f"/cases/{case_id(db, 'RO-CRO/2026/00133')}/act", headers=ro).status_code == 200


# ── can_act_on_case ──────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "email, ref, action, expected",
    [
        ("senior@aicte.example", "RB/2026/00087", ActionType.escalate, True),
        ("senior@aicte.example", "RB/2026/00087", ActionType.remark, True),
        ("senior@aicte.example", "RB/2026/00087", ActionType.dispose, False),  # PRD §4.2: escalate and remark only
        ("senior@aicte.example", "RB/2026/00087", ActionType.transfer, False),
        ("pgrc.head@aicte.example", "PGRC/2026/00412", ActionType.dispose, True),
        ("pgrc.head@aicte.example", "RB/2026/00087", ActionType.escalate, False),
        ("ro.central@aicte.example", "RO-CRO/2026/00133", ActionType.transfer, True),
        ("ro.central@aicte.example", "RB/2026/00087", ActionType.remark, False),
        ("intake@aicte.example", "PGRC/2026/00412", ActionType.remark, False),
    ],
)
def test_can_act_on_case(db: Session, email: str, ref: str, action: ActionType, expected: bool) -> None:
    case = db.exec(select(Case).where(Case.case_ref == ref)).one()
    assert scope.can_act_on_case(user(db, email), case, action) is expected


# ── Coordination rule: summary cards ─────────────────────────────────────


def test_cards_show_group_mates_outside_scope(db: Session) -> None:
    """The RB head sees RB/00087 in full and the PGRC and RO cases of its group as cards only."""
    rb = user(db, "rb.head@aicte.example")
    group_one = {case_id(db, r) for r in ("PGRC/2026/00412", "RB/2026/00087", "RO-CRO/2026/00133")}
    visible = scope.card_case_ids(db, rb, group_one)
    assert visible == group_one
    in_scope = scope.in_scope_callback(db, rb)
    flags = {db.get(Case, i).case_ref: in_scope(db.get(Case, i)) for i in group_one}  # type: ignore[union-attr]
    assert flags == {"PGRC/2026/00412": False, "RB/2026/00087": True, "RO-CRO/2026/00133": False}


def test_case_in_no_group_with_an_in_scope_case_has_no_card(db: Session) -> None:
    rb = user(db, "rb.head@aicte.example")
    others: Set[int] = {case_id(db, "PGRC/2026/00398"), case_id(db, "AB/2026/00056")}
    assert scope.card_case_ids(db, rb, others) == set()
    assert scope.card_case_ids(db, rb, set()) == set()


def test_cards_are_a_reduced_view_with_no_description_or_complainant(db: Session) -> None:
    case = db.exec(select(Case).where(Case.case_ref == "PGRC/2026/00412")).one()
    card = linked_case_card(db, case, scope.in_scope_callback(db, user(db, "rb.head@aicte.example")))
    dumped = card.model_dump_json()
    for forbidden in ("description", "complainant", "document", case.complainant_name, case.description):
        assert forbidden not in dumped
    assert card.in_scope is False and card.case_ref == "PGRC/2026/00412"
