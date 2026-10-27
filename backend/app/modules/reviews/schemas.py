from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel

from app.core.enums import ReviewStatus
from app.modules.institutions.models import PermanentIdStr
from app.modules.reviews.models import MatchReviewBase


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
