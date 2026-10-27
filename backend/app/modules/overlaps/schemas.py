from datetime import date, datetime
from typing import Annotated, List, Literal, Optional, Union

from pydantic import BaseModel, Field as PydanticField
from sqlmodel import Field, SQLModel

from app.core.enums import (
    ActionType,
    CaseStatus,
    OverlapGroupStatus,
    OverlapLevel,
    OverlapTier,
    PairDecision,
)
from app.core.schemas import PageParams
from app.modules.overlaps.models import OverlapGroupBase, OverlapPairBase

# ── Table schemas (#6) ───────────────────────────────────────────────────


class OverlapPairCreate(OverlapPairBase):
    pass


class OverlapPairUpdate(SQLModel):
    score: Optional[float] = Field(default=None, ge=0, le=1)
    decision: Optional[PairDecision] = None


class OverlapPairRead(OverlapPairBase):
    """One `overlap_pair` row: pairwise evidence, case_a_id < case_b_id."""

    id: int
    decision: PairDecision
    created_at: datetime


class OverlapGroupCreate(OverlapGroupBase):
    pass


class OverlapGroupUpdate(SQLModel):
    tier: Optional[OverlapTier] = None
    status: Optional[OverlapGroupStatus] = None
    coordinator_id: Optional[int] = None
    decision_remark: Optional[str] = Field(default=None, max_length=2000)


class OverlapGroupRead(OverlapGroupBase):
    id: int
    status: OverlapGroupStatus
    coordinator_id: Optional[int]
    decided_by: Optional[int]
    decided_at: Optional[datetime]
    decision_remark: Optional[str]
    created_at: datetime
    updated_at: datetime


class OverlapLinkCreate(SQLModel):
    group_id: int
    case_id: int


class OverlapLinkRead(OverlapLinkCreate):
    """Membership rows are added or removed, never edited, so there is no update schema."""

    id: int
    added_at: datetime


# ── API contract (PRD §5) ────────────────────────────────────────────────


class LinkedCaseCard(BaseModel):
    """
    Summary card of a case in an overlap group, shown even outside the viewer's scope
    (PRD §4.2 coordination rule). Never carries the description or complainant name.
    """

    case_id: int
    case_ref: str
    permanent_id: Optional[str]
    institution_name: Optional[str]
    bureau_id: int
    bureau_code: str
    status: CaseStatus
    category_id: int
    category_code: str
    subject: str
    assigned_officer_id: Optional[int]
    assigned_officer_name: Optional[str]
    last_action_type: Optional[ActionType]
    last_action_at: Optional[datetime]
    received_at: date
    in_scope: bool  # whether the viewer may open the full case


class OverlapSummary(BaseModel):
    """PRD §5 `OverlapSummary`. `banner` is the PS's exact text for probable groups."""

    group_id: int
    level: OverlapLevel
    tier: OverlapTier
    status: OverlapGroupStatus
    banner: str
    cases: List[LinkedCaseCard]
    reasons: List[str]


class OverlapGroupListItem(OverlapGroupRead):
    """A card in the Overlap Center (GET /overlaps)."""

    anchor_name: str
    banner: str
    coordinator_name: Optional[str]
    case_count: int
    bureau_codes: List[str]
    top_score: float


class OverlapListParams(PageParams):
    tier: Optional[OverlapTier] = None
    status: Optional[OverlapGroupStatus] = None
    level: Optional[OverlapLevel] = None
    bureau_id: Optional[int] = None


class OverlapCluster(BaseModel):
    """Issue cluster inside a group (complete linkage, PRD §4.5)."""

    cluster_id: int
    label: str
    case_ids: List[int]


class OverlapGroupDetail(BaseModel):
    """GET /overlaps/{id} and the result of POST /overlaps/{id}/decision."""

    group: OverlapGroupListItem
    # Full case records for cases in scope and reduced cards otherwise.
    cases: List[dict]
    clusters: List[OverlapCluster]
    pairs: List[OverlapPairRead]
    reasons: List[str]


class ConfirmDecision(BaseModel):
    decision: Literal["confirm"]
    coordinator_id: int
    remark: Optional[str] = PydanticField(default=None, max_length=2000)


class DismissDecision(BaseModel):
    decision: Literal["dismiss"]
    # Required in practice: a missing remark is rejected with 400 REMARKS_REQUIRED (#17).
    remark: Optional[str] = PydanticField(default=None, max_length=2000)


class ResolveDecision(BaseModel):
    decision: Literal["resolve"]
    remark: Optional[str] = PydanticField(default=None, max_length=2000)


OverlapDecisionIn = Annotated[
    Union[ConfirmDecision, DismissDecision, ResolveDecision], PydanticField(discriminator="decision")
]
