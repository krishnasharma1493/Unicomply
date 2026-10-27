"""Data model + tiny seed (#6): load, relative dates, fixture parity, constraints, idempotency."""

import json
import subprocess
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict

import pytest
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel, col, create_engine, select
from sqlmodel.pool import StaticPool

from app.core.enums import AlertSeverity, AlertType, OverlapLevel
from app.modules.alerts.models import Alert
from app.modules.cases.models import Case, CaseAction
from app.modules.cases.schemas import CaseCreate, CaseRead
from app.modules.institutions.models import InstitutionAlias
from app.modules.overlaps.models import OverlapPair
from app.modules.reviews.schemas import MatchReviewUpdate
from app.seed import SEED_DIR, load_seed, reset_and_seed, seed_if_empty
from tests.conftest import SEED_AS_OF

REPO = Path(__file__).resolve().parents[2]
FIXTURES = REPO / "contract" / "fixtures"

# PRD §4.7 hero story: (case_ref, days before DEMO_TODAY, status)
HERO = {
    101: ("PGRC/2026/00412", 19, "under_process"),
    102: ("RB/2026/00087", 10, "under_process"),
    103: ("RO-CRO/2026/00133", 5, "received"),
    104: ("RB/2026/00079", 30, "escalated"),
}


def fresh_engine():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    return engine


def test_seed_loads_every_table() -> None:
    with Session(fresh_engine()) as session:
        counts = load_seed(session, today=SEED_AS_OF)
    assert counts == {
        "bureaus": 14, "categories": 12, "users": 12, "trusts": 3, "institutions": 10, "aliases": 5,
        "cases": 13, "case_actions": 19, "match_reviews": 2, "overlap_groups": 4, "overlap_links": 9,
        "overlap_pairs": 6, "alerts": 6,
    }


@pytest.mark.parametrize("today", [SEED_AS_OF, date(2026, 10, 28), date(2027, 3, 1)])
def test_hero_cases_keep_their_day_offsets(today: date) -> None:
    """§4.7 statuses and dates relative to DEMO_TODAY; PGRC/2026/00412 is always day 19 of 21."""
    with Session(fresh_engine()) as session:
        load_seed(session, today=today)
        for case_id, (ref, days_ago, status) in HERO.items():
            case = session.get(Case, case_id)
            assert case is not None
            assert (case.case_ref, case.status.value) == (ref, status)
            assert case.received_at == today - timedelta(days=days_ago)
        hero = session.get(Case, 101)
        assert hero is not None
        assert (today - hero.received_at).days == 19
        assert (hero.sla_due_on - hero.received_at).days == 21


def _norm(value: Any) -> Any:
    if isinstance(value, str) and value.endswith("Z"):
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value
    return value


def test_seeded_cases_match_the_contract_fixtures(seeded_engine) -> None:
    """Every stored column equals contract/fixtures/get_cases.json, so the real API matches the mocks."""
    fixture = {c["id"]: c for c in json.loads((FIXTURES / "get_cases.json").read_text())["data"]}
    with Session(seeded_engine) as session:
        cases = session.exec(select(Case)).all()
        assert {c.id for c in cases} == set(fixture)
        for case in cases:
            row: Dict[str, Any] = CaseRead.model_validate(case).model_dump(mode="python")
            for field, stored in row.items():
                expected = fixture[case.id][field]
                if isinstance(stored, date) and not isinstance(stored, datetime):
                    stored = stored.isoformat()
                if hasattr(stored, "value"):
                    stored = stored.value
                assert _norm(stored) == _norm(expected), (case.case_ref, field)


def test_last_action_columns_match_the_history(seeded_engine) -> None:
    with Session(seeded_engine) as session:
        for case in session.exec(select(Case)).all():
            actions = session.exec(
                select(CaseAction).where(CaseAction.case_id == case.id).order_by(col(CaseAction.created_at))
            ).all()
            if not actions:
                assert case.last_action_type is None
                continue
            assert actions[-1].action_type == case.last_action_type
            assert _norm(actions[-1].created_at) == _norm(case.last_action_at)


def test_alert_dedupe_day_moves_with_the_dates() -> None:
    with Session(fresh_engine()) as session:
        load_seed(session, today=SEED_AS_OF + timedelta(days=3))
        alert = session.get(Alert, 505)
        assert alert is not None
        assert alert.dedupe_key == "sla_breach:3:case-104:2026-11-23"
        assert alert.created_at.date() == date(2026, 11, 23)


def test_unique_constraints_hold(seeded_engine) -> None:
    with Session(seeded_engine) as session:
        session.add(
            Alert(type=AlertType.reminder, severity=AlertSeverity.info, recipient_id=3, title="t", body="b",
                  dedupe_key="sla_breach:3:case-104:2026-11-20")
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        session.add(InstitutionAlias(permanent_id="1-4812730561", alias_norm="VVIET", source="seed"))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        session.add(OverlapPair(case_a_id=102, case_b_id=101, level=OverlapLevel.institution, score=0.5, reasons=[]))
        with pytest.raises(IntegrityError):  # case_a_id < case_b_id
            session.commit()


def test_permanent_id_pattern_is_enforced_by_schemas() -> None:
    """SQLModel ignores Field(regex=...), so schemas use PermanentIdStr; make sure it bites."""
    base = dict(source_channel="email", received_at="2026-11-20", complainant_type="parent",
                raw_institution_text="vindya valley engg college", category_id=2, subject="Certificates",
                description="Certificates withheld by the college.")
    assert CaseCreate.model_validate({**base, "permanent_id": "1-4812730561"}).permanent_id == "1-4812730561"
    for bad in ("2-4812730561", "1-123", "VVIET"):
        with pytest.raises(ValidationError):
            CaseCreate.model_validate({**base, "permanent_id": bad})
    with pytest.raises(ValidationError):
        MatchReviewUpdate.model_validate({"decided_permanent_id": "abc"})


def test_seed_is_fast_and_repeatable() -> None:
    engine = fresh_engine()
    started = time.perf_counter()
    reset_and_seed(engine)
    reset_and_seed(engine)
    assert time.perf_counter() - started < 10
    assert seed_if_empty(engine) is False  # already seeded: nothing to do
    with Session(engine) as session:
        assert len(session.exec(select(Case)).all()) == 13


def test_seed_readme_documents_every_file() -> None:
    readme = (SEED_DIR / "README.md").read_text()
    for path in SEED_DIR.glob("*.json"):
        assert f"`{path.name}`" in readme, path.name


def test_database_file_is_not_committed_but_seed_json_is() -> None:
    ignored = subprocess.run(
        ["git", "check-ignore", "-q", "backend/app.db"], cwd=REPO, capture_output=True
    )
    assert ignored.returncode == 0
    not_ignored = subprocess.run(
        ["git", "check-ignore", "-q", "backend/seed_data/cases.json"], cwd=REPO, capture_output=True
    )
    assert not_ignored.returncode == 1
