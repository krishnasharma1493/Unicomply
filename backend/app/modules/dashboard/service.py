"""
Dashboard numbers (PRD §4.1 derived fields, §7 Dashboard). Everything is counted in SQL over
`scope_cases`, so each persona sees totals for exactly the cases they may open, and nothing is stored.
"""

from datetime import timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import Select, and_, case, func
from sqlmodel import Session, col, select

from app.core.enums import CaseStatus, OverlapGroupStatus
from app.core.scope import scope_cases
from app.modules.cases.models import Case
from app.modules.dashboard.schemas import AgeingBucket, DashboardSummary, InstitutionStatusRow, WorkloadRow
from app.modules.institutions.models import Institution
from app.modules.meta.models import Bureau
from app.modules.overlaps.models import OverlapGroup, OverlapLink
from app.modules.users.models import User
from app.utils.time import today

OPEN_STATUSES = [s for s in CaseStatus if s != CaseStatus.disposed]
UNDER_PROCESS = (CaseStatus.under_process, CaseStatus.interim_reply)

# (key, label, min_days, max_days): days since `received_at`, oldest bucket open-ended.
_BUCKETS: List[Tuple[str, str, int, Optional[int]]] = [
    ("0_7", "0–7 days", 0, 7),
    ("8_14", "8–14 days", 8, 14),
    ("15_21", "15–21 days", 15, 21),
    ("22_45", "22–45 days", 22, 45),
    ("45_plus", "45+ days", 46, None),
]


def _scoped_ids(user: User) -> Select[Any]:
    """Ids of the cases `user` may open; the base of every query below."""
    return scope_cases(select(Case.id), user)


def _is_open() -> Any:
    return col(Case.status) != CaseStatus.disposed


def _is_late() -> Any:
    """Beyond SLA: open and `today() > sla_due_on`."""
    return and_(_is_open(), col(Case.sla_due_on) < today())


def _count_if(condition: Any) -> Any:
    return func.coalesce(func.sum(case((condition, 1), else_=0)), 0)


def _open_group_ids() -> Select[Any]:
    return select(OverlapGroup.id).where(col(OverlapGroup.status) == OverlapGroupStatus.open)


def summary(session: Session, user: User) -> DashboardSummary:
    row = session.exec(
        select(  # type: ignore[call-overload]
            func.count(),
            _count_if(_is_open()),
            _count_if(col(Case.status).in_(UNDER_PROCESS)),
            _count_if(col(Case.status) == CaseStatus.disposed),
            _count_if(col(Case.status) == CaseStatus.transferred),
            _count_if(col(Case.status) == CaseStatus.escalated),
            _count_if(_is_late()),
        ).where(col(Case.id).in_(_scoped_ids(user)))
    ).one()
    open_overlaps = session.exec(
        select(func.count(func.distinct(OverlapLink.group_id))).where(
            col(OverlapLink.group_id).in_(_open_group_ids()),
            col(OverlapLink.case_id).in_(_scoped_ids(user)),
        )
    ).one()
    total, pending, under_process, disposed, transferred, escalated, beyond_sla = (int(n) for n in row)
    return DashboardSummary(
        as_of=today(),
        total=total,
        pending=pending,
        under_process=under_process,
        disposed=disposed,
        transferred=transferred,
        escalated=escalated,
        beyond_sla=beyond_sla,
        open_overlaps=int(open_overlaps),
    )


def workload(session: Session, user: User) -> List[WorkloadRow]:
    """Open cases per current bureau, split by status; busiest bureau first."""
    rows = session.exec(
        select(Case.current_bureau_id, Case.status, func.count(), _count_if(_is_late()))
        .where(col(Case.id).in_(_scoped_ids(user)), _is_open())
        .group_by(col(Case.current_bureau_id), col(Case.status))
    ).all()
    by_bureau: Dict[int, Dict[CaseStatus, int]] = {}
    late: Dict[int, int] = {}
    for bureau_id, status, n, n_late in rows:
        by_bureau.setdefault(bureau_id, {s: 0 for s in OPEN_STATUSES})[CaseStatus(status)] = int(n)
        late[bureau_id] = late.get(bureau_id, 0) + int(n_late)
    bureaus = {
        b.id: b for b in session.exec(select(Bureau).where(col(Bureau.id).in_(list(by_bureau)))).all()
    }
    out = [
        WorkloadRow(
            bureau_id=bureau_id,
            bureau_code=bureaus[bureau_id].code,
            bureau_name=bureaus[bureau_id].name,
            open=sum(statuses.values()),
            beyond_sla=late[bureau_id],
            by_status=statuses,
        )
        for bureau_id, statuses in by_bureau.items()
    ]
    return sorted(out, key=lambda r: (-r.open, r.bureau_id))


def ageing(session: Session, user: User) -> List[AgeingBucket]:
    """Open cases by days since `received_at`; every bucket is returned, empty ones as 0."""
    now = today()
    counts = {}
    for key, _, low, high in _BUCKETS:
        # No lower bound on the first bucket: a future-dated case still counts as brand new.
        cond = [col(Case.received_at) <= now - timedelta(days=low)] if low else []
        if high is not None:
            cond.append(col(Case.received_at) >= now - timedelta(days=high))
        counts[key] = session.exec(
            select(func.count()).where(col(Case.id).in_(_scoped_ids(user)), _is_open(), *cond)
        ).one()
    return [
        AgeingBucket(bucket=key, label=label, min_days=low, max_days=high, count=int(counts[key]))  # type: ignore[arg-type]
        for key, label, low, high in _BUCKETS
    ]


def institutions(session: Session, user: User, limit: int) -> List[InstitutionStatusRow]:
    """Top institutions by open cases, with a status split; ties go to the one most beyond SLA, then by name."""
    rows = session.exec(
        select(Case.permanent_id, Case.status, func.count(), _count_if(_is_late()))
        .where(col(Case.id).in_(_scoped_ids(user)), col(Case.permanent_id).is_not(None))
        .group_by(col(Case.permanent_id), col(Case.status))
    ).all()
    split: Dict[str, Dict[CaseStatus, int]] = {}
    late: Dict[str, int] = {}
    for permanent_id, status, n, n_late in rows:
        if permanent_id is None:
            continue
        split.setdefault(permanent_id, {s: 0 for s in CaseStatus})[CaseStatus(status)] = int(n)
        late[permanent_id] = late.get(permanent_id, 0) + int(n_late)
    open_count = {pid: sum(n for s, n in st.items() if s != CaseStatus.disposed) for pid, st in split.items()}
    insts = {
        i.permanent_id: i
        for i in session.exec(
            select(Institution).where(col(Institution.permanent_id).in_([p for p, n in open_count.items() if n]))
        ).all()
    }
    top = sorted(insts.values(), key=lambda i: (-open_count[i.permanent_id], -late[i.permanent_id], i.name, i.permanent_id))[:limit]
    groups = _open_overlap_groups(session, user, [i.permanent_id for i in top])
    return [
        InstitutionStatusRow(
            permanent_id=i.permanent_id,
            name=i.name,
            district=i.district,
            state=i.state,
            region=i.region,
            total=sum(split[i.permanent_id].values()),
            open=open_count[i.permanent_id],
            beyond_sla=late[i.permanent_id],
            open_overlap_groups=groups.get(i.permanent_id, 0),
            by_status=split[i.permanent_id],
        )
        for i in top
    ]


def _open_overlap_groups(session: Session, user: User, permanent_ids: List[str]) -> Dict[str, int]:
    """Open groups per institution, counted over the in-scope cases of that institution."""
    if not permanent_ids:
        return {}
    rows = session.exec(
        select(Case.permanent_id, func.count(func.distinct(OverlapLink.group_id)))
        .join(OverlapLink, col(OverlapLink.case_id) == col(Case.id))
        .where(
            col(Case.permanent_id).in_(permanent_ids),
            col(Case.id).in_(_scoped_ids(user)),
            col(OverlapLink.group_id).in_(_open_group_ids()),
        )
        .group_by(col(Case.permanent_id))
    ).all()
    return {pid: int(n) for pid, n in rows if pid is not None}
