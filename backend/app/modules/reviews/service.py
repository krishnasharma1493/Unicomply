"""Human review queue and decisions for institution resolution."""

from datetime import datetime
from typing import List, Optional

from sqlalchemy import func
from sqlmodel import Session, col, select

from app.core.enums import MatchStatus, ReviewStatus
from app.core.errors import AlreadyDecidedError, NotFoundError
from app.modules.audit.models import AuditLog
from app.modules.cases.models import Case
from app.modules.cases.service import case_read
from app.modules.engine import service as engine_service
from app.modules.institutions.models import Institution, InstitutionAlias
from app.modules.institutions.schemas import Candidate, InstitutionAliasRead
from app.modules.overlaps.schemas import OverlapSummary
from app.modules.reviews.models import MatchReview
from app.modules.reviews.schemas import ReviewDecideResult, ReviewItem, ReviewListParams
from app.modules.users.models import User
from app.utils.time import utcnow


def list_reviews(session: Session, params: ReviewListParams) -> tuple[List[ReviewItem], int]:
    stmt = select(MatchReview)
    if params.status is not None:
        stmt = stmt.where(MatchReview.status == params.status)
    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    rows = session.exec(stmt.order_by(col(MatchReview.created_at), col(MatchReview.id))
                        .offset((params.page - 1) * params.limit).limit(params.limit)).all()
    return [_item(session, review) for review in rows], total


def decide(session: Session, review_id: int, body, actor: User) -> ReviewDecideResult:
    review = session.get(MatchReview, review_id)
    if review is None:
        raise NotFoundError("Match review not found")
    if review.status != ReviewStatus.pending:
        raise AlreadyDecidedError()
    permanent_id: Optional[str] = getattr(body, "permanent_id", None)
    if permanent_id and session.get(Institution, permanent_id) is None:
        raise NotFoundError("Institution not found")
    case = session.get(Case, review.case_id)
    if case is None:
        raise NotFoundError("Case not found")
    now = utcnow()
    old_case_pid, old_match_status = case.permanent_id, case.match_status
    old_review_status = review.status
    review.status = ReviewStatus.resolved
    review.decided_permanent_id = permanent_id
    review.decided_by = actor.id
    review.decided_at = now
    session.add(review)
    if permanent_id is None:
        case.permanent_id = None
        case.match_score = None
        case.match_status = MatchStatus.unresolved
        case.updated_at = now
        session.add(case)
        overlaps: List[OverlapSummary] = engine_service.on_review_decided(session, review, None)
    else:
        overlaps = engine_service.on_review_decided(session, review, permanent_id)
        session.refresh(case)
    changes = [
        ("review", str(review.id), "status", old_review_status.value, review.status.value),
        ("review", str(review.id), "decided_permanent_id", None, permanent_id),
        ("review", str(review.id), "decided_by", None, actor.id),
        ("case", str(case.id), "permanent_id", old_case_pid, case.permanent_id),
        ("case", str(case.id), "match_status", old_match_status.value, case.match_status.value),
    ]
    for entity, entity_id, field, old, new in changes:
        if old != new:
            session.add(AuditLog(actor_id=actor.id, entity=entity, entity_id=entity_id, field=field,
                                 old_value=str(old) if old is not None else None,
                                 new_value=str(new) if new is not None else None))
    session.flush()
    alias_row = None
    if permanent_id:
        from app.modules.engine.service import alias_norm_of
        alias_norm = alias_norm_of(case.raw_institution_text)
        alias_row = session.exec(select(InstitutionAlias).where(
            InstitutionAlias.permanent_id == permanent_id, InstitutionAlias.alias_norm == alias_norm
        )).first()
    return ReviewDecideResult(
        review=_item(session, review), case=case_read(session, case),
        alias=InstitutionAliasRead.model_validate(alias_row) if alias_row else None,
        overlaps=overlaps,
    )


def _item(session: Session, review: MatchReview) -> ReviewItem:
    case = session.get(Case, review.case_id)
    if case is None:
        raise NotFoundError("Case not found")
    candidates = [Candidate.model_validate(candidate) for candidate in review.candidates]
    return ReviewItem(
        id=review.id, case_id=review.case_id, candidates=candidates, status=review.status,
        decided_permanent_id=review.decided_permanent_id, decided_by=review.decided_by,
        decided_at=review.decided_at, case_ref=case.case_ref,
        raw_institution_text=case.raw_institution_text, raw_state=case.raw_state,
        raw_district=case.raw_district, subject=case.subject, received_at=case.received_at,
        created_at=review.created_at,
    )
