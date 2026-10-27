from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.core.enums import ActionType, CaseStatus, ComplainantType, MatchStatus
from app.modules.cases.models import CaseActionBase, CaseBase
from app.modules.institutions.models import PermanentIdStr


class CaseCreate(CaseBase):
    """PRD §5 `CaseCreate`: the intake body."""

    permanent_id: Optional[PermanentIdStr] = None  # if the operator already knows it
    route_to_bureau_id: Optional[int] = None  # default = the category's default bureau


class CaseUpdate(SQLModel):
    """Corrections to intake data. Status changes only go through case actions (§4.3)."""

    external_ref: Optional[str] = Field(default=None, max_length=60)
    complainant_type: Optional[ComplainantType] = None
    complainant_name: Optional[str] = Field(default=None, max_length=120)
    subject: Optional[str] = Field(default=None, min_length=3, max_length=200)
    description: Optional[str] = Field(default=None, min_length=10, max_length=4000)
    category_id: Optional[int] = None
    next_action: Optional[str] = Field(default=None, max_length=300)


class CaseRead(CaseBase):
    """Every §4.1 `case` column. #7 / #14 add the derived read-only fields of the contract."""

    id: int
    case_ref: str
    match_score: Optional[float]
    match_status: MatchStatus
    category_suggested_id: Optional[int]
    status: CaseStatus
    current_bureau_id: int
    assigned_officer_id: Optional[int]
    last_action_type: Optional[ActionType]
    last_action_at: Optional[datetime]
    next_action: Optional[str]
    expected_disposal_date: Optional[date]
    sla_due_on: date
    disposed_at: Optional[datetime]
    reopen_count: int
    escalation_level: int
    delay_risk: Optional[float]
    created_by: int
    created_at: datetime
    updated_at: datetime


class CaseActionCreate(CaseActionBase):
    """Fields a caller supplies; case, actor, bureau and timestamp come from the server."""


class CaseActionRead(CaseActionBase):
    """Append-only history, so there is no update schema (PRD §6)."""

    id: int
    case_id: int
    actor_id: int
    bureau_id: int
    from_bureau_id: Optional[int]
    created_at: datetime
