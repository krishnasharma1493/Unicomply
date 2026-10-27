"""Cases (complaints + regulatory actions) and their action history (PRD §4.1, §4.3)."""

from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.core.enums import (
    ActionType,
    CaseStatus,
    ComplainantType,
    DisposeOutcome,
    MatchStatus,
    SourceChannel,
)
from app.utils.time import utcnow


class CaseBase(SQLModel):
    """What intake supplies (PRD §5 `CaseCreate`, minus routing)."""

    source_channel: SourceChannel
    external_ref: Optional[str] = Field(default=None, max_length=60)  # e.g. CPGRAMS registration no.
    received_at: date
    complainant_type: ComplainantType
    complainant_name: Optional[str] = Field(default=None, max_length=120)
    raw_institution_text: str = Field(min_length=3, max_length=300)
    raw_state: Optional[str] = Field(default=None, max_length=60)
    raw_district: Optional[str] = Field(default=None, max_length=60)
    permanent_id: Optional[str] = Field(
        default=None, foreign_key="institution.permanent_id", index=True, max_length=12
    )
    category_id: int = Field(foreign_key="category.id")
    subject: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10, max_length=4000)


class Case(CaseBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    case_ref: str = Field(index=True, unique=True, max_length=30)  # e.g. PGRC/2026/00412
    match_score: Optional[float] = Field(default=None, ge=0, le=1)
    match_status: MatchStatus = MatchStatus.unresolved
    category_suggested_id: Optional[int] = Field(default=None, foreign_key="category.id")
    status: CaseStatus = Field(default=CaseStatus.received, index=True)
    current_bureau_id: int = Field(foreign_key="bureau.id", index=True)
    assigned_officer_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    last_action_type: Optional[ActionType] = None
    last_action_at: Optional[datetime] = None
    next_action: Optional[str] = Field(default=None, max_length=300)
    expected_disposal_date: Optional[date] = None
    sla_due_on: date = Field(index=True)
    disposed_at: Optional[datetime] = None
    reopen_count: int = Field(default=0, ge=0)
    escalation_level: int = Field(default=0, ge=0)
    delay_risk: Optional[float] = Field(default=None, ge=0, le=1)
    created_by: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class CaseActionBase(SQLModel):
    action_type: ActionType
    to_bureau_id: Optional[int] = Field(default=None, foreign_key="bureau.id")
    to_officer_id: Optional[int] = Field(default=None, foreign_key="user.id")
    outcome: Optional[DisposeOutcome] = None
    remarks: Optional[str] = Field(default=None, max_length=2000)


class CaseAction(CaseActionBase, table=True):
    """The workflow and action history (PS feature 5). Append-only: never updated or deleted."""

    __tablename__ = "case_action"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    case_id: int = Field(foreign_key="case.id", index=True)
    actor_id: int = Field(foreign_key="user.id")
    bureau_id: int = Field(foreign_key="bureau.id")  # the bureau acting
    from_bureau_id: Optional[int] = Field(default=None, foreign_key="bureau.id")
    created_at: datetime = Field(default_factory=utcnow, index=True)
