"""Job loop (#35): SLA warnings, breach digests, no-action reminders and the engine re-scan (PRD §4.6)."""

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import List, Set

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlmodel import Session, col, func, select

from app import jobs
from app.core.config import Settings
from app.core.enums import ActionType, AlertType, CaseStatus, Role
from app.main import create_app
from app.modules.alerts import service as alerts_service
from app.modules.alerts.models import Alert
from app.modules.cases.models import Case, CaseAction
from app.modules.engine import service as engine_service
from app.modules.users.models import User

TODAY = date(2026, 11, 20)  # what the tiny seed is dated for
SINCE = datetime(2026, 11, 20, tzinfo=timezone.utc)
PGRC_HEAD, RB_HEAD, SENIOR = "pgrc.head@aicte.example", "rb.head@aicte.example", "senior@aicte.example"


@pytest.fixture(autouse=True)
def demo_today(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(jobs, "today", lambda: TODAY)
    monkeypatch.setattr(alerts_service, "today", lambda: TODAY)


@pytest.fixture(autouse=True)
def quiet_engine(monkeypatch: pytest.MonkeyPatch) -> None:
    """Most tests are about alerts; the re-scan has its own test."""
    monkeypatch.setattr(engine_service, "rescan_since", lambda session, since: 0)


def user_id(session: Session, email: str) -> int:
    uid = session.exec(select(User.id).where(User.email == email)).one()
    assert uid is not None
    return uid


@pytest.fixture(name="seed_ids")
def seed_ids_fixture(seeded_engine: Engine) -> Set[int]:
    """Ids of the alerts the seed already holds, so tests only look at what the tick created."""
    with Session(seeded_engine) as session:
        return {i for i in session.exec(select(Alert.id)).all() if i is not None}


def fresh(session: Session, seed_ids: Set[int], type: AlertType, ref: str = "") -> List[Alert]:
    stmt = select(Alert).where(Alert.type == type).order_by(col(Alert.id))
    return [a for a in session.exec(stmt).all() if a.id not in seed_ids and ref in a.title + a.body]


def case_by_ref(session: Session, ref: str) -> Case:
    return session.exec(select(Case).where(Case.case_ref == ref)).one()


def bureaus_with_a_recipient(session: Session) -> Set[int]:
    """The tiny seed has no head for AB or RO-WRO: alerts addressed to them have nobody to reach."""
    rows = session.exec(select(User.bureau_id).where(col(User.role).in_([Role.bureau_head, Role.ro_officer]))).all()
    return {b for b in rows if b is not None}


def ticks(engine: Engine, n: int, settings: Settings) -> List[jobs.TickResult]:
    out = []
    for _ in range(n):
        with Session(engine) as session:
            out.append(jobs.tick(session, SINCE, settings))
    return out


# ── SLA warning ─────────────────────────────────────────────────────────────


def test_sla_warning_on_pgrc_00412_appears_exactly_once_across_many_ticks(
    seeded_engine: Engine, test_settings: Settings, seed_ids: Set[int]
) -> None:
    results = ticks(seeded_engine, 12, test_settings)
    assert [r.sla_warnings for r in results] == [2] + [0] * 11  # 00412 and the reopened 00377
    with Session(seeded_engine) as session:
        mine = fresh(session, seed_ids, AlertType.sla_warning, "PGRC/2026/00412")
        assert len(mine) == 1
        assert mine[0].recipient_id == user_id(session, PGRC_HEAD)
        assert mine[0].severity.value == "warning" and mine[0].permanent_id == "1-4812730561"
        assert "day 19 of 21" in mine[0].title and "Assigned officer:" in mine[0].body


def test_warning_starts_at_the_configured_day_and_stops_once_breached(
    seeded_engine: Engine, test_settings: Settings, seed_ids: Set[int]
) -> None:
    ticks(seeded_engine, 1, test_settings)
    with Session(seeded_engine) as session:
        warned = {a.case_id for a in fresh(session, seed_ids, AlertType.sla_warning)}
        reachable = bureaus_with_a_recipient(session)
        for case in session.exec(select(Case).where(col(Case.status) != CaseStatus.disposed)).all():
            day = (TODAY - case.received_at).days
            due = day >= test_settings.SLA_WARN_DAY and TODAY <= case.sla_due_on and case.current_bureau_id in reachable
            assert (case.id in warned) == due, case.case_ref


def test_warning_day_is_configurable(seeded_engine: Engine, test_settings: Settings, seed_ids: Set[int]) -> None:
    ticks(seeded_engine, 1, test_settings.model_copy(update={"SLA_WARN_DAY": 5}))
    with Session(seeded_engine) as session:
        assert len({a.case_id for a in fresh(session, seed_ids, AlertType.sla_warning)}) > 2


# ── SLA breach ──────────────────────────────────────────────────────────────


def test_breach_alerts_once_per_case_for_heads_and_one_digest_for_senior(
    seeded_engine: Engine, test_settings: Settings, seed_ids: Set[int]
) -> None:
    results = ticks(seeded_engine, 8, test_settings)
    # PGRC/2026/00398 for the PGRC head + the senior digest; the RB head's two late cases are in the seed already
    assert [r.sla_breaches for r in results] == [2, 0, 0, 0, 0, 0, 0, 0]
    with Session(seeded_engine) as session:
        made = fresh(session, seed_ids, AlertType.sla_breach)
        assert len(made) == 2 and all(a.severity.value == "critical" for a in made)
        by_recipient = {a.recipient_id: a for a in made}
        assert by_recipient[user_id(session, PGRC_HEAD)].title == "Beyond SLA: PGRC/2026/00398"
        assert "Day 27 of 21" in by_recipient[user_id(session, PGRC_HEAD)].body
        digest = by_recipient[user_id(session, SENIOR)]
        assert digest.title == "3 cases are beyond SLA" and digest.case_id is None


def test_breach_alerts_agree_with_the_seeded_ones(seeded_engine: Engine, test_settings: Settings) -> None:
    """The RB head already has alerts for 00079 and 00121 today; the job must not add a second."""
    ticks(seeded_engine, 2, test_settings)
    with Session(seeded_engine) as session:
        rb = user_id(session, RB_HEAD)
        titles = [a.title for a in session.exec(select(Alert).where(Alert.type == AlertType.sla_breach, Alert.recipient_id == rb)).all()]
        assert sorted(titles) == ["Beyond SLA: RB/2026/00079", "Beyond SLA: RO-CRO/2026/00121"]


def test_digest_lists_the_longest_overdue_first(seeded_engine: Engine, test_settings: Settings, seed_ids: Set[int]) -> None:
    ticks(seeded_engine, 1, test_settings)
    with Session(seeded_engine) as session:
        body = next(a.body for a in fresh(session, seed_ids, AlertType.sla_breach) if a.recipient_id == user_id(session, SENIOR))
        refs = ["RB/2026/00079", "PGRC/2026/00398", "RO-CRO/2026/00121"]
        assert all(r in body for r in refs)
        due = {r: case_by_ref(session, r).sla_due_on for r in refs}
        assert sorted(refs, key=body.index) == sorted(refs, key=lambda r: due[r])


def test_the_next_day_brings_new_breach_alerts(
    seeded_engine: Engine, test_settings: Settings, monkeypatch: pytest.MonkeyPatch, seed_ids: Set[int]
) -> None:
    ticks(seeded_engine, 2, test_settings)
    tomorrow = TODAY + timedelta(days=1)
    monkeypatch.setattr(jobs, "today", lambda: tomorrow)
    monkeypatch.setattr(alerts_service, "today", lambda: tomorrow)
    # three late cases for their heads + the digest
    assert [r.sla_breaches for r in ticks(seeded_engine, 3, test_settings)] == [4, 0, 0]
    with Session(seeded_engine) as session:
        keys = session.exec(select(Alert.dedupe_key).where(Alert.type == AlertType.sla_breach)).all()
        assert sum(k.endswith(tomorrow.isoformat()) for k in keys) == 4


def test_no_breach_alerts_when_nothing_is_late(seeded_engine: Engine, test_settings: Settings) -> None:
    with Session(seeded_engine) as session:
        for case in session.exec(select(Case)).all():
            case.sla_due_on = TODAY + timedelta(days=30)
            session.add(case)
        session.commit()
    assert ticks(seeded_engine, 1, test_settings)[0].sla_breaches == 0


# ── No-action reminder ──────────────────────────────────────────────────────


def test_reminder_for_every_open_case_idle_for_the_configured_days(
    seeded_engine: Engine, test_settings: Settings, seed_ids: Set[int]
) -> None:
    results = ticks(seeded_engine, 5, test_settings)
    with Session(seeded_engine) as session:
        last = dict(session.exec(select(CaseAction.case_id, func.max(CaseAction.created_at)).group_by(col(CaseAction.case_id))).all())
        reachable = bureaus_with_a_recipient(session)
        expected = set()
        for case in session.exec(select(Case).where(col(Case.status) != CaseStatus.disposed)).all():
            idle_since = last[case.id].date() if case.id in last else case.received_at
            if (TODAY - idle_since).days >= test_settings.NO_ACTION_REMINDER_DAYS and case.current_bureau_id in reachable:
                expected.add(case.id)
        assert expected, "the seed should have stale cases"
        got = fresh(session, seed_ids, AlertType.reminder)
        assert {a.case_id for a in got} == expected and len(got) == len(expected)
        assert sum(r.reminders for r in results) == len(expected)
        assert all(a.severity.value == "info" and a.title.startswith("No action for ") for a in got)


def test_a_recent_action_silences_the_reminder(seeded_engine: Engine, test_settings: Settings, seed_ids: Set[int]) -> None:
    with Session(seeded_engine) as session:
        case = case_by_ref(session, "PGRC/2026/00412")
        assert case.id is not None
        session.add(CaseAction(case_id=case.id, action_type=ActionType.remark, actor_id=2, bureau_id=2,
                               created_at=datetime(2026, 11, 19, 9, tzinfo=timezone.utc)))
        session.commit()
    ticks(seeded_engine, 1, test_settings)
    with Session(seeded_engine) as session:
        assert fresh(session, seed_ids, AlertType.reminder, "PGRC/2026/00412") == []


# ── Engine re-scan and failure handling ─────────────────────────────────────


def test_tick_rescans_cases_changed_since_the_last_tick(
    seeded_engine: Engine, test_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: List[datetime] = []

    def rescan(session: Session, since: datetime) -> int:
        seen.append(since)
        return 4

    monkeypatch.setattr(engine_service, "rescan_since", rescan)
    assert ticks(seeded_engine, 1, test_settings)[0].rescanned == 4 and seen == [SINCE]


def test_the_real_rescan_runs_on_the_seeded_world(
    seeded_engine: Engine, test_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.undo()  # keep the date patch off; use the real rescan with a window covering the whole seed
    with Session(seeded_engine) as session:
        result = jobs.tick(session, datetime(2000, 1, 1, tzinfo=timezone.utc), test_settings)
        resolved_open = session.exec(
            select(func.count()).select_from(Case).where(col(Case.permanent_id).is_not(None), col(Case.status) != CaseStatus.disposed)
        ).one()
    assert result.rescanned == resolved_open


def test_a_failing_tick_rolls_back_its_alerts_and_raises(
    seeded_engine: Engine, test_settings: Settings, monkeypatch: pytest.MonkeyPatch, seed_ids: Set[int]
) -> None:
    def boom(session: Session, since: datetime) -> int:
        raise RuntimeError("engine down")

    monkeypatch.setattr(engine_service, "rescan_since", boom)
    with Session(seeded_engine) as session, pytest.raises(RuntimeError):
        jobs.tick(session, SINCE, test_settings)
    with Session(seeded_engine) as session:
        assert session.exec(select(func.count()).select_from(Alert)).one() == len(seed_ids)
    # the next tick, with the engine back, raises everything once
    monkeypatch.setattr(engine_service, "rescan_since", lambda session, since: 0)
    assert ticks(seeded_engine, 1, test_settings)[0].alerts > 0


# ── The loop ────────────────────────────────────────────────────────────────


def test_loop_survives_a_failed_tick_retries_the_window_and_stops_on_cancel(
    seeded_engine: Engine, test_settings: Settings, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    windows: List[datetime] = []

    def run_tick(engine: Engine, since: datetime, settings: Settings) -> jobs.TickResult:
        windows.append(since)
        if len(windows) == 1:
            raise RuntimeError("transient")
        return jobs.TickResult()

    real_sleep = asyncio.sleep

    async def fast_sleep(_: float) -> None:
        await real_sleep(0)

    monkeypatch.setattr(jobs, "run_tick", run_tick)
    monkeypatch.setattr(jobs.asyncio, "sleep", fast_sleep)

    async def scenario() -> None:
        task = asyncio.create_task(jobs.job_loop(seeded_engine, test_settings))
        while len(windows) < 3:
            await real_sleep(0.01)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    with caplog.at_level(logging.INFO, logger="unicomply.jobs"):
        asyncio.run(scenario())
    assert windows[0] == windows[1]  # the failed tick's window is retried, not skipped
    assert windows[2] > windows[1]  # and moves on after a success
    assert "Job tick failed" in caplog.text and "Job loop stopped" in caplog.text


def test_app_starts_the_loop_when_enabled_and_stops_it_cleanly(
    test_settings: Settings, caplog: pytest.LogCaptureFixture
) -> None:
    settings = test_settings.model_copy(update={"ENABLE_SCHEDULER": True})
    with caplog.at_level(logging.INFO, logger="unicomply.jobs"):
        with TestClient(create_app(custom_settings=settings)):
            pass
    assert "Job loop started" in caplog.text and "Job loop stopped" in caplog.text


def test_app_does_not_start_the_loop_by_default(test_settings: Settings, caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO, logger="unicomply.jobs"):
        with TestClient(create_app(custom_settings=test_settings)):
            pass
    assert "Job loop" not in caplog.text
