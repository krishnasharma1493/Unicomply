"""
Reports (PRD §5, §12.4; PS feature 8). Every kind is a SQL GROUP BY over `scope_cases`, limited to the
cases received between `from` and `to`; derived values are computed per request, never stored.
Heads see their own scope, so the same report differs by persona.
"""

from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import Select, and_, case, exists, func, or_
from sqlmodel import Session, col, select

from app.core.enums import ActionType, CaseStatus, OverlapLevel, Region
from app.core.scope import scope_cases
from app.modules.cases.models import Case, CaseAction
from app.modules.cases.service import validation_error
from app.modules.dashboard.service import BUCKETS, bucket_conditions
from app.modules.institutions.models import Institution
from app.modules.institutions.schemas import CaseCounts
from app.modules.meta.models import Bureau
from app.modules.overlaps.models import OverlapGroup, OverlapLink
from app.modules.reports import schemas as s
from app.modules.users.models import User
from app.utils.time import today, utcnow

# kind → (group_by echoed in the report, columns). Labels double as the CSV header.
_COLUMNS: Dict[str, Tuple[str, List[Tuple[str, str]]]] = {
    "bureau": ("bureau", [
        ("bureau_code", "Bureau"), ("bureau_name", "Name"), ("total", "Total"), ("open", "Open"),
        ("disposed", "Disposed"), ("beyond_sla", "Beyond SLA"), ("avg_open_age_days", "Avg. age of open cases (days)"),
    ]),
    "region": ("region", [
        ("region_name", "Region"), ("total", "Total"), ("open", "Open"), ("disposed", "Disposed"),
        ("beyond_sla", "Beyond SLA"),
    ]),
    "institution": ("institution", [
        ("permanent_id", "Permanent ID"), ("name", "Institution"), ("total", "Total"), ("open", "Open"),
        ("disposed", "Disposed"), ("beyond_sla", "Beyond SLA"), ("reopened", "Reopened"),
        ("overlap_groups", "Overlap groups"),
    ]),
    "status": ("status", [("status_name", "Status"), ("count", "Cases")]),
    "ageing": ("bucket", [("label", "Age since received"), ("open", "Open cases"), ("beyond_sla", "Beyond SLA")]),
    "disposal_rate": ("bureau", [
        ("bureau_code", "Bureau"), ("received", "Received"), ("disposed", "Disposed"),
        ("disposal_rate", "Disposal rate"),
    ]),
    "reopen_rate": ("bureau", [
        ("bureau_code", "Bureau"), ("disposed", "Disposed at least once"), ("reopened", "Reopened"),
        ("reopen_rate", "Reopen rate"),
    ]),
    "overlaps": ("level,tier,status", [
        ("level", "Level"), ("tier", "Tier"), ("status", "Status"), ("groups", "Groups"), ("cases", "Cases"),
    ]),
    "periodic": ("month", [
        ("period", "Month"), ("received", "Received"), ("disposed", "Disposed"), ("reopened", "Reopened"),
    ]),
}


def _name(value: str) -> str:
    """`north_eastern` → `North-Eastern` (the labels /meta serves)."""
    return "-".join(part.title() for part in value.split("_"))


def _status_name(status: CaseStatus) -> str:
    return status.value.replace("_", " ").capitalize()


def _rate(part: int, whole: int) -> Optional[float]:
    return round(part / whole, 3) if whole else None


class Window:
    """The report period and everything a query needs from it."""

    def __init__(self, user: User, from_: Optional[date], to: Optional[date], now: date) -> None:
        self.user, self.now = user, now
        self.to = to or now
        # Default: the current month and the two before it (2026-11-20 → 2026-09-01).
        self.from_ = from_ or date(self.to.year + (self.to.month - 3) // 12, (self.to.month - 3) % 12 + 1, 1)
        if self.from_ > self.to:
            raise validation_error("from", "`from` must not be after `to`")

    def cases(self) -> List[Any]:
        """WHERE clauses: in scope and received inside the period."""
        return [
            col(Case.id).in_(scope_cases(select(Case.id), self.user)),
            col(Case.received_at) >= self.from_,
            col(Case.received_at) <= self.to,
        ]

    def acted(self) -> Tuple[datetime, datetime]:
        """Half-open datetime range covering the period, for action timestamps."""
        utc = timezone.utc
        return (
            datetime.combine(self.from_, time.min, utc),
            datetime.combine(self.to + timedelta(days=1), time.min, utc),
        )

    def is_late(self) -> Any:
        return and_(col(Case.status) != CaseStatus.disposed, col(Case.sla_due_on) < self.now)


def _count_if(condition: Any) -> Any:
    return func.coalesce(func.sum(case((condition, 1), else_=0)), 0)


def _counts(w: Window) -> Tuple[Any, ...]:
    """total, open, disposed, beyond SLA: the four numbers most reports are made of."""
    is_open = col(Case.status) != CaseStatus.disposed
    return func.count(), _count_if(is_open), _count_if(~is_open), _count_if(w.is_late())


def _case_counts(total: int, open_: int, disposed: int, beyond_sla: int) -> Dict[str, int]:
    return {"total": int(total), "open": int(open_), "disposed": int(disposed), "beyond_sla": int(beyond_sla)}


def _totals(rows: List[Any]) -> CaseCounts:
    return CaseCounts(
        total=sum(r.total for r in rows), open=sum(r.open for r in rows),
        disposed=sum(r.disposed for r in rows), beyond_sla=sum(r.beyond_sla for r in rows),
    )


def _envelope(kind: str, w: Window, rows: List[Any], totals: Any, group_by: Optional[str] = None) -> Dict[str, Any]:
    default_group, columns = _COLUMNS[kind]
    return {
        "kind": kind, "from_": w.from_, "to": w.to, "group_by": group_by or default_group,
        "generated_at": utcnow(), "columns": [s.ReportColumn(key=k, label=lbl) for k, lbl in columns],
        "rows": rows, "totals": totals,
    }


# ── Kinds ────────────────────────────────────────────────────────────────


def bureau(session: Session, w: Window) -> s.BureauReport:
    age = func.julianday(w.now.isoformat()) - func.julianday(col(Case.received_at))
    rows = session.exec(
        select(  # type: ignore[call-overload]
            Case.current_bureau_id, *_counts(w),
            func.avg(case((col(Case.status) != CaseStatus.disposed, age), else_=None)),
        ).where(*w.cases()).group_by(col(Case.current_bureau_id))
    ).all()
    names = {b.id: b for b in session.exec(select(Bureau)).all()}
    out = [
        s.BureauReportRow(
            bureau_code=names[bid].code, bureau_name=names[bid].name, **_case_counts(*counts),
            avg_open_age_days=round(float(avg), 1) if avg is not None else None,
        )
        for bid, *counts, avg in sorted(rows, key=lambda r: r[0])
    ]
    return s.BureauReport(**_envelope("bureau", w, out, _totals(out)))


def region(session: Session, w: Window) -> s.RegionReport:
    rows = session.exec(
        select(Institution.region, *_counts(w))  # type: ignore[call-overload]
        .select_from(Case)
        .join(Institution, col(Institution.permanent_id) == col(Case.permanent_id), isouter=True)
        .where(*w.cases()).group_by(col(Institution.region))
    ).all()
    order = {r: i for i, r in enumerate(Region)}
    out = [
        s.RegionReportRow(
            region=Region(reg) if reg else None,
            region_name=_name(reg.value if isinstance(reg, Region) else reg) if reg else "Institution not yet resolved",
            **_case_counts(*counts),
        )
        for reg, *counts in sorted(rows, key=lambda r: (r[0] is None, order.get(r[0], 0)))
    ]
    return s.RegionReport(**_envelope("region", w, out, _totals(out)))


def institution(session: Session, w: Window) -> s.InstitutionReport:
    rows = session.exec(
        select(  # type: ignore[call-overload]
            Institution.permanent_id, Institution.name, Institution.region, *_counts(w),
            _count_if(col(Case.reopen_count) > 0),
        )
        .select_from(Case)
        .join(Institution, col(Institution.permanent_id) == col(Case.permanent_id))
        .where(*w.cases()).group_by(col(Institution.permanent_id), col(Institution.name), col(Institution.region))
    ).all()
    groups = dict(session.exec(
        select(Case.permanent_id, func.count(func.distinct(OverlapLink.group_id)))
        .join(OverlapLink, col(OverlapLink.case_id) == col(Case.id))
        .where(*w.cases(), col(Case.permanent_id).is_not(None)).group_by(col(Case.permanent_id))
    ).all())
    out = [
        s.InstitutionReportRow(
            permanent_id=pid, name=name, region=Region(reg), **_case_counts(*counts), reopened=int(reopened),
            overlap_groups=int(groups.get(pid, 0)),
        )
        for pid, name, reg, *counts, reopened in sorted(rows, key=lambda r: (-r[4], -r[6], r[1], r[0]))
    ]
    return s.InstitutionReport(**_envelope("institution", w, out, _totals(out)))


def status(session: Session, w: Window) -> s.StatusReport:
    counts = dict(session.exec(select(Case.status, func.count()).where(*w.cases()).group_by(col(Case.status))).all())
    out = [s.StatusReportRow(status=st, status_name=_status_name(st), count=int(counts.get(st, 0))) for st in CaseStatus]
    return s.StatusReport(**_envelope("status", w, out, s.StatusReportTotals(count=sum(r.count for r in out))))


def ageing(session: Session, w: Window) -> s.AgeingReport:
    out = []
    for key, label, low, high in BUCKETS:
        n_open, n_late = session.exec(
            select(func.count(), _count_if(w.is_late())).where(  # type: ignore[call-overload]
                *w.cases(), col(Case.status) != CaseStatus.disposed, *bucket_conditions(w.now, low, high)
            )
        ).one()
        out.append(s.AgeingReportRow(bucket=key, label=label, open=int(n_open), beyond_sla=int(n_late)))  # type: ignore[arg-type]
    totals = s.AgeingReportTotals(open=sum(r.open for r in out), beyond_sla=sum(r.beyond_sla for r in out))
    return s.AgeingReport(**_envelope("ageing", w, out, totals))


def _by_bureau(session: Session, w: Window, *measures: Any) -> List[Tuple[str, List[int]]]:
    """(bureau code, measures) for every bureau holding a case in scope, in bureau-id order."""
    rows = session.exec(
        select(Bureau.id, Bureau.code, *measures)  # type: ignore[call-overload]
        .select_from(Case).join(Bureau, col(Bureau.id) == col(Case.current_bureau_id))
        .where(*w.cases()).group_by(col(Bureau.id), col(Bureau.code)).order_by(col(Bureau.id))
    ).all()
    return [(code, [int(n) for n in measured]) for _, code, *measured in rows]


def disposal_rate(session: Session, w: Window) -> s.DisposalRateReport:
    rows = _by_bureau(session, w, func.count(), _count_if(col(Case.status) == CaseStatus.disposed))
    out = [s.DisposalRateRow(bureau_code=code, received=r, disposed=d, disposal_rate=_rate(d, r)) for code, (r, d) in rows]
    received, disposed = sum(r.received for r in out), sum(r.disposed for r in out)
    totals = s.DisposalRateTotals(received=received, disposed=disposed, disposal_rate=_rate(disposed, received))
    return s.DisposalRateReport(**_envelope("disposal_rate", w, out, totals))


def reopen_rate(session: Session, w: Window) -> s.ReopenRateReport:
    """Reopened ÷ cases disposed at least once (reopening clears `disposed_at`, so the history is the source)."""
    disposed_once = or_(
        col(Case.status) == CaseStatus.disposed,
        col(Case.reopen_count) > 0,
        exists().where(
            col(CaseAction.case_id) == col(Case.id), col(CaseAction.action_type) == ActionType.dispose
        ),
    )
    rows = _by_bureau(session, w, _count_if(disposed_once), _count_if(col(Case.reopen_count) > 0))
    out = [s.ReopenRateRow(bureau_code=code, disposed=d, reopened=r, reopen_rate=_rate(r, d)) for code, (d, r) in rows]
    disposed, reopened = sum(r.disposed for r in out), sum(r.reopened for r in out)
    totals = s.ReopenRateTotals(disposed=disposed, reopened=reopened, reopen_rate=_rate(reopened, disposed))
    return s.ReopenRateReport(**_envelope("reopen_rate", w, out, totals))


def overlaps(session: Session, w: Window) -> s.OverlapsReport:
    """Groups by level, tier and decision status, over the in-scope cases of the period."""
    rows = session.exec(
        select(  # type: ignore[call-overload]
            OverlapGroup.level, OverlapGroup.tier, OverlapGroup.status,
            func.count(func.distinct(OverlapGroup.id)), func.count(),
        )
        .select_from(OverlapLink)
        .join(OverlapGroup, col(OverlapGroup.id) == col(OverlapLink.group_id))
        .join(Case, col(Case.id) == col(OverlapLink.case_id))
        .where(*w.cases())
        .group_by(col(OverlapGroup.level), col(OverlapGroup.tier), col(OverlapGroup.status))
    ).all()
    levels = {lv: i for i, lv in enumerate(OverlapLevel)}
    out = [
        s.OverlapsReportRow(level=lv, tier=tier, status=st, groups=int(g), cases=int(c))
        for lv, tier, st, g, c in sorted(rows, key=lambda r: (levels[r[0]], r[1].value, r[2].value))
    ]
    totals = s.OverlapsReportTotals(groups=sum(r.groups for r in out), cases=sum(r.cases for r in out))
    return s.OverlapsReport(**_envelope("overlaps", w, out, totals))


def _months(start: date, end: date) -> List[str]:
    out, cur = [], date(start.year, start.month, 1)
    while cur <= end:
        out.append(cur.strftime("%Y-%m"))
        cur = date(cur.year + cur.month // 12, cur.month % 12 + 1, 1)
    return out


def _quarter(month: str) -> str:
    return f"{month[:4]}-Q{(int(month[5:]) - 1) // 3 + 1}"


def periodic(session: Session, w: Window, group_by: str) -> s.PeriodicReport:
    """Received by `received_at`; disposed and reopened by when the dispose / reopen action happened."""
    received = dict(session.exec(
        select(func.strftime("%Y-%m", Case.received_at), func.count()).where(*w.cases()).group_by(
            func.strftime("%Y-%m", Case.received_at))
    ).all())
    start, stop = w.acted()
    month = func.strftime("%Y-%m", CaseAction.created_at)
    acted: Dict[Tuple[str, ActionType], int] = {
        (str(m), ActionType(a)): int(n) for m, a, n in session.exec(
            select(month, CaseAction.action_type, func.count())
            .where(
                col(CaseAction.case_id).in_(scope_cases(select(Case.id), w.user)),
                col(CaseAction.action_type).in_([ActionType.dispose, ActionType.reopen]),
                col(CaseAction.created_at) >= start, col(CaseAction.created_at) < stop,
            )
            .group_by(month, col(CaseAction.action_type))
        ).all()
    }
    buckets: Dict[str, List[int]] = {}
    for m in _months(w.from_, w.to):
        key = _quarter(m) if group_by == "quarter" else m
        row = buckets.setdefault(key, [0, 0, 0])
        row[0] += int(received.get(m, 0))
        row[1] += acted.get((m, ActionType.dispose), 0)
        row[2] += acted.get((m, ActionType.reopen), 0)
    out = [s.PeriodicReportRow(period=p, received=r, disposed=d, reopened=o) for p, (r, d, o) in buckets.items()]
    totals = s.PeriodicReportTotals(
        received=sum(r.received for r in out), disposed=sum(r.disposed for r in out),
        reopened=sum(r.reopened for r in out),
    )
    report = _envelope("periodic", w, out, totals, group_by=group_by)
    report["columns"][0] = s.ReportColumn(key="period", label="Quarter" if group_by == "quarter" else "Month")
    return s.PeriodicReport(**report)


def build(session: Session, user: User, kind: str, p: s.ReportParams) -> Any:
    group_by = p.group_by or "month"
    if kind == "periodic" and group_by not in ("month", "quarter"):
        raise validation_error("group_by", "group_by must be `month` or `quarter`")
    w = Window(user, p.from_, p.to, today())
    if kind == "periodic":
        return periodic(session, w, group_by)
    builders = {
        "bureau": bureau, "region": region, "institution": institution, "status": status, "ageing": ageing,
        "disposal_rate": disposal_rate, "reopen_rate": reopen_rate, "overlaps": overlaps,
    }
    return builders[kind](session, w)
