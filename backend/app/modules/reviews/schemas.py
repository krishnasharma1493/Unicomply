from datetime import date, datetime
from typing import List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict
from sqlmodel import SQLModel

from app.core.enums import ReviewStatus
from app.core.schemas import PageParams
from app.modules.cases.schemas import CaseRead
from app.modules.institutions.models import PermanentIdStr
from app.modules.institutions.schemas import Candidate, InstitutionAliasRead
from app.modules.overlaps.schemas import OverlapSummary
from app.modules.reviews.models import MatchReviewBase

# ── Table schemas (#6) ───────────────────────────────────────────────────


class MatchReviewCreate(MatchReviewBase):
    pass


class MatchReviewUpdate(SQLModel):
    status: Optional[ReviewStatus] = None
    decided_permanent_id: Optional[PermanentIdStr] = None


class MatchReviewRead(MatchReviewBase):
    id: int
    status: ReviewStatus
    decided_permanent_id: Optional[str]
    decided_by: Optional[int]
    decided_at: Optional[datetime]
    created_at: datetime


# ── API contract (PRD §5) ────────────────────────────────────────────────


class ReviewItem(BaseModel):
    """One uncertain match in the review queue, with the case fields the operator needs."""

    id: int
    case_id: int
    candidates: List[Candidate]
    status: ReviewStatus
    decided_permanent_id: Optional[str]
    decided_by: Optional[int]
    decided_at: Optional[datetime]
    case_ref: str
    raw_institution_text: str
    raw_state: Optional[str]
    raw_district: Optional[str]
    subject: str
    received_at: date
    created_at: datetime


class ReviewListParams(PageParams):
    status: Optional[ReviewStatus] = ReviewStatus.pending


class PickInstitution(BaseModel):
    model_config = ConfigDict(extra="forbid")

    permanent_id: PermanentIdStr


class NotInRegistry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    none: Literal[True]


# POST /reviews/{id}/decide body: `{permanent_id}` or `{none: true}` ("not in registry").
ReviewDecideIn = Union[PickInstitution, NotInRegistry]


class ReviewDecideResult(BaseModel):
    review: ReviewItem
    case: CaseRead
    alias: Optional[InstitutionAliasRead]  # null when decided with {none: true}
    overlaps: List[OverlapSummary]  # groups created or extended by the overlap re-run
