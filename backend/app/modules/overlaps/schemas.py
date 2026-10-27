from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.core.enums import OverlapGroupStatus, OverlapTier, PairDecision
from app.modules.overlaps.models import OverlapGroupBase, OverlapPairBase


class OverlapPairCreate(OverlapPairBase):
    pass


class OverlapPairUpdate(SQLModel):
    score: Optional[float] = Field(default=None, ge=0, le=1)
    decision: Optional[PairDecision] = None


class OverlapPairRead(OverlapPairBase):
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
