"""
Who may see and do what (PRD §4.2). Every case list goes through `scope_cases`, every by-id
load through `get_case_in_scope_or_404` (404, never 403, for scope), and role-only gates use
`require_roles`. Read-only: nothing here writes or commits.
"""

from typing import Any, Callable, Set, TypeVar

from fastapi import Depends
from sqlalchemy import Select, false
from sqlmodel import Session, col, select

from app.core.deps import CurrentUser
from app.core.enums import ActionType, OverlapGroupStatus, Role
from app.core.errors import ForbiddenError, NotFoundError
from app.modules.cases.models import Case
from app.modules.institutions.models import Institution
from app.modules.overlaps.models import OverlapGroup, OverlapLink
from app.modules.users.models import User

S = TypeVar("S", bound=Select[Any])


def scope_cases(stmt: S, user: User) -> S:
    """
    Restrict a `select(Case)` (or a select that selects from Case) to the cases `user` may open
    in full. Roles with no case access, and an RO officer with no region, see nothing.
    """
    if user.role == Role.senior_mgmt:
        return stmt
    if user.role == Role.bureau_head:
        return stmt.where(col(Case.current_bureau_id) == user.bureau_id)
    if user.role == Role.ro_officer:
        if user.region is None:
            return stmt.where(false())
        # Institutions in the officer's region, whichever bureau holds the case. An unresolved
        # case has no institution, hence no region, and stays out of an RO's view.
        return stmt.join(Institution, col(Institution.permanent_id) == col(Case.permanent_id)).where(
            col(Institution.region) == user.region
        )
    if user.role == Role.intake_operator:
        return stmt.where(col(Case.created_by) == user.id)
    return stmt.where(false())


def case_in_scope(session: Session, user: User, case_id: int) -> bool:
    return session.exec(scope_cases(select(Case.id).where(Case.id == case_id), user)).first() is not None


def get_case_in_scope_or_404(session: Session, case_id: int, user: User) -> Case:
    """A missing case and one outside the caller's scope are indistinguishable (404)."""
    case = session.exec(scope_cases(select(Case).where(Case.id == case_id), user)).first()
    if case is None:
        raise NotFoundError("Case not found")
    return case


def require_roles(*roles: Role) -> Any:
    """`Depends(...)` that returns the user, or raises 403 `FORBIDDEN` for any other role."""
    allowed = set(roles)

    def dep(user: CurrentUser) -> User:
        if user.role not in allowed:
            raise ForbiddenError()
        return user

    return Depends(dep)


def can_act_on_case(user: User, case: Case, action: ActionType) -> bool:
    """
    The "Can do" column of PRD §4.2. Call it on a case already loaded through
    `get_case_in_scope_or_404`: seeing a case is not enough to act on it. A bureau head or RO officer
    takes any action on a case at their own bureau / RO; the senior officer may escalate or remark on
    any case (and decides overlaps elsewhere); intake operators only create cases and decide reviews.
    """
    if user.role == Role.senior_mgmt:
        return action in (ActionType.escalate, ActionType.remark)
    if user.role in (Role.bureau_head, Role.ro_officer):
        return user.bureau_id is not None and case.current_bureau_id == user.bureau_id
    return False


def require_can_act(user: User, case: Case, action: ActionType) -> None:
    if not can_act_on_case(user, case, action):
        raise ForbiddenError()


def card_case_ids(session: Session, user: User, case_ids: Set[int]) -> Set[int]:
    """
    The coordination rule (PRD §4.2): of `case_ids`, the ones `user` may see as summary cards.
    That is every case in scope, plus every case sharing an open or confirmed overlap group with an
    in-scope case (a dismissed group was judged to need no coordination).
    Cards never carry the description or complainant name, so showing them is safe.
    """
    if not case_ids:
        return set()
    visible = {
        i
        for i in session.exec(scope_cases(select(Case.id).where(col(Case.id).in_(case_ids)), user)).all()
        if i is not None
    }
    rest = case_ids - visible
    if not rest:
        return visible
    # Active groups containing an in-scope case, among the groups the remaining cases belong to.
    link = OverlapLink
    active = select(OverlapGroup.id).where(
        col(OverlapGroup.status).in_([OverlapGroupStatus.open, OverlapGroupStatus.confirmed])
    )
    shared = session.exec(
        select(link.case_id)
        .where(col(link.case_id).in_(rest))
        .where(col(link.group_id).in_(active))
        .where(
            col(link.group_id).in_(
                scope_cases(select(link.group_id).join(Case, col(Case.id) == col(link.case_id)), user)
            )
        )
    ).all()
    return visible | set(shared)


def in_scope_callback(session: Session, user: User) -> Callable[[Case], bool]:
    """The `in_scope` callback the engine façade and card builders take (see engine.builders)."""
    scoped: Set[int] = set()
    checked: Set[int] = set()

    def check(case: Case) -> bool:
        if case.id is None:
            return False
        if case.id not in checked:
            checked.add(case.id)
            if case_in_scope(session, user, case.id):
                scoped.add(case.id)
        return case.id in scoped

    return check
