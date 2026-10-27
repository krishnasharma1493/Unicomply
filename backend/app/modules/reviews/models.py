"""Human-in-the-loop queue for mid-confidence institution matches (PRD §4.1, §4.4)."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from app.core.enums import ReviewStatus
from app.utils.time import utcnow


class MatchReviewBase(SQLModel):
    case_id: int = Field(foreign_key="case.id", index=True)
    # [{permanent_id, name, district, state, score, reasons}], best first
    candidates: List[Dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))


class MatchReview(MatchReviewBase, table=True):
    __tablename__ = "match_review"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    status: ReviewStatus = Field(default=ReviewStatus.pending, index=True)
    decided_permanent_id: Optional[str] = Field(
        default=None, foreign_key="institution.permanent_id", max_length=12
    )
    decided_by: Optional[int] = Field(default=None, foreign_key="user.id")
    decided_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)
