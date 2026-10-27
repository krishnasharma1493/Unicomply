"""Overlap evidence and groups: pairs, groups and group membership (PRD §4.1, §4.5)."""

from datetime import datetime
from typing import List, Optional

from sqlalchemy import JSON, CheckConstraint, Column, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.core.enums import OverlapGroupStatus, OverlapLevel, OverlapTier, PairDecision
from app.utils.time import utcnow


class OverlapPairBase(SQLModel):
    case_a_id: int = Field(foreign_key="case.id", index=True)
    case_b_id: int = Field(foreign_key="case.id", index=True)
    level: OverlapLevel
    score: float = Field(ge=0, le=1)
    reasons: List[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))


class OverlapPair(OverlapPairBase, table=True):
    """Pairwise evidence; dismissed pairs never re-alert."""

    __tablename__ = "overlap_pair"  # type: ignore[assignment]
    __table_args__ = (
        UniqueConstraint("case_a_id", "case_b_id"),
        CheckConstraint("case_a_id < case_b_id", name="ck_overlap_pair_order"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    decision: PairDecision = PairDecision.none
    created_at: datetime = Field(default_factory=utcnow)


class OverlapGroupBase(SQLModel):
    level: OverlapLevel
    # Permanent ID, `parent:<permanent_id>` or `trust:<id>`: groups are anchored on the registry.
    anchor_key: str = Field(index=True, max_length=40)
    tier: OverlapTier


class OverlapGroup(OverlapGroupBase, table=True):
    """One group = cases that must be coordinated."""

    __tablename__ = "overlap_group"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    status: OverlapGroupStatus = Field(default=OverlapGroupStatus.open, index=True)
    coordinator_id: Optional[int] = Field(default=None, foreign_key="user.id")
    decided_by: Optional[int] = Field(default=None, foreign_key="user.id")
    decided_at: Optional[datetime] = None
    decision_remark: Optional[str] = Field(default=None, max_length=2000)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class OverlapLink(SQLModel, table=True):
    """Group membership."""

    __tablename__ = "overlap_link"  # type: ignore[assignment]
    __table_args__ = (UniqueConstraint("group_id", "case_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    group_id: int = Field(foreign_key="overlap_group.id", index=True)
    case_id: int = Field(foreign_key="case.id", index=True)
    added_at: datetime = Field(default_factory=utcnow)
