"""
Convert table rows to the matching engine's dataclasses (app.matching.types) and back to
API schemas. Read-only: nothing here writes to the database.
"""

from __future__ import annotations

from typing import Callable, Optional

from sqlmodel import Session

from app.core.enums import ResolutionDecision
from app.matching.types import CaseLite, InstitutionLite, ResolutionResult
from app.modules.cases.models import Case
from app.modules.institutions.models import Institution
from app.modules.institutions.schemas import Candidate, Resolution
from app.modules.meta.models import Bureau, Category
from app.modules.overlaps.models import OverlapGroup
from app.modules.overlaps.schemas import LinkedCaseCard
from app.modules.users.models import User

# Whether the viewer may open a case in full; #12's scope check plugs in here (#14 / #16 / #17).
InScope = Callable[[Case], bool]


def everyone(_: Case) -> bool:
    """Default scope check until #12: every case is in scope."""
    return True


def coordinator_name(session: Session, group: OverlapGroup) -> Optional[str]:
    """Who coordinates a confirmed group (PRD §4.5: the coordinator's name is shown on each case)."""
    user = session.get(User, group.coordinator_id) if group.coordinator_id else None
    return user.name if user else None


def institution_lite(row: Institution) -> InstitutionLite:
    return InstitutionLite(
        permanent_id=row.permanent_id,
        name=row.name,
        name_norm=row.name_norm,
        acronym=row.acronym,
        district=row.district,
        state=row.state,
        region=row.region.value,
        trust_id=row.trust_id,
        parent_id=row.parent_id,
    )


def case_lite(session: Session, row: Case) -> CaseLite:
    assert row.id is not None, "flush the case before building CaseLite"
    bureau = session.get(Bureau, row.current_bureau_id)
    category = session.get(Category, row.category_id)
    return CaseLite(
        id=row.id,
        case_ref=row.case_ref,
        permanent_id=row.permanent_id,
        bureau_id=row.current_bureau_id,
        bureau_code=bureau.code if bureau else str(row.current_bureau_id),
        category_code=category.code if category else str(row.category_id),
        description=row.description,
        received_at=row.received_at,
        status=row.status.value,
        disposed_at=row.disposed_at.date() if row.disposed_at else None,
    )


def resolution_schema(result: ResolutionResult) -> Resolution:
    """matching.ResolutionResult → the API's PRD §5 `Resolution`."""
    return Resolution(
        decision=ResolutionDecision(result.decision),
        candidates=[
            Candidate(
                permanent_id=c.permanent_id,
                name=c.name,
                district=c.district,
                state=c.state,
                score=c.score,
                reasons=list(c.reasons),
            )
            for c in result.candidates
        ],
    )


def linked_case_card(session: Session, row: Case, in_scope: InScope = everyone) -> LinkedCaseCard:
    """
    The coordination summary card (PRD §4.2). Never includes the description or the
    complainant name, whatever the viewer's scope.
    """
    assert row.id is not None
    bureau = session.get(Bureau, row.current_bureau_id)
    category = session.get(Category, row.category_id)
    institution: Optional[Institution] = (
        session.get(Institution, row.permanent_id) if row.permanent_id else None
    )
    officer = session.get(User, row.assigned_officer_id) if row.assigned_officer_id else None
    return LinkedCaseCard(
        case_id=row.id,
        case_ref=row.case_ref,
        permanent_id=row.permanent_id,
        institution_name=institution.name if institution else None,
        bureau_id=row.current_bureau_id,
        bureau_code=bureau.code if bureau else str(row.current_bureau_id),
        status=row.status,
        category_id=row.category_id,
        category_code=category.code if category else str(row.category_id),
        subject=row.subject,
        assigned_officer_id=row.assigned_officer_id,
        assigned_officer_name=officer.name if officer else None,
        last_action_type=row.last_action_type,
        last_action_at=row.last_action_at,
        received_at=row.received_at,
        in_scope=in_scope(row),
    )
