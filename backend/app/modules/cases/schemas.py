from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field as PydanticField, field_validator
from sqlmodel import Field, SQLModel

from app.core.enums import (
    ActionType,
    CaseStatus,
    ComplainantType,
    DisposeOutcome,
    MatchStatus,
    Region,
)
from app.core.schemas import PageParams
from app.modules.cases.models import CaseActionBase, CaseBase
from app.modules.institutions.models import PermanentIdStr
from app.modules.institutions.schemas import InstitutionLite, Resolution
from app.modules.overlaps.schemas import OverlapSummary

# ── Table schemas (#6) ───────────────────────────────────────────────────


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


class CaseRecord(CaseBase):
    """Every stored §4.1 `case` column, nothing derived."""

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


# ── API contract (PRD §5) ────────────────────────────────────────────────


class CaseRead(CaseRecord):
    """A case as the API returns it: every column plus read-only derived fields (never stored)."""

    institution_name: Optional[str]
    region: Optional[Region]
    age_days: int
    beyond_sla: bool
    in_overlap: bool


CaseListItem = CaseRead


class CaseListParams(PageParams):
    """Search & filters for GET /cases (PS feature 6)."""

    q: Optional[str] = PydanticField(default=None, max_length=300, description="Institution name or raw text")
    permanent_id: Optional[str] = PydanticField(default=None, max_length=13)
    case_ref: Optional[str] = PydanticField(default=None, max_length=30)
    bureau_id: Optional[int] = None
    region: Optional[Region] = None
    category: Optional[str] = PydanticField(default=None, max_length=40, description="Category code")
    status: Optional[str] = PydanticField(
        default=None, max_length=120, description="One status, or several separated by commas (e.g. under_process,interim_reply)"
    )
    pending: Optional[bool] = PydanticField(default=None, description="true = not disposed, false = disposed")
    from_: Optional[date] = PydanticField(default=None, alias="from")
    to: Optional[date] = None
    beyond_sla: Optional[bool] = None
    in_overlap: Optional[bool] = None
    sort: Literal["received_desc", "sla_due_asc"] = PydanticField(
        default="received_desc", description="received_desc (newest first, default) or sla_due_asc (soonest SLA due first)"
    )

    model_config = {"populate_by_name": True}

    @field_validator("status")
    @classmethod
    def _known_statuses(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        parts = [part.strip() for part in value.split(",") if part.strip()]
        known = {s.value for s in CaseStatus}
        unknown = [part for part in parts if part not in known]
        if not parts or unknown:
            raise ValueError(f"Unknown status {', '.join(unknown) or value!r}; use one or more of {', '.join(sorted(known))}")
        return ",".join(parts)

    def statuses(self) -> List[CaseStatus]:
        return [CaseStatus(part) for part in self.status.split(",")] if self.status else []


class CaseActionEntry(CaseActionRead):
    """One row of the action timeline."""

    actor_name: str


class CaseActionIn(BaseModel):
    """PRD §5 `CaseActionIn`: POST /cases/{id}/actions. Per-action rules live in §4.3 (#15)."""

    action_type: ActionType
    remarks: Optional[str] = PydanticField(default=None, max_length=2000)
    to_bureau_id: Optional[int] = None
    to_officer_id: Optional[int] = None
    expected_disposal_date: Optional[date] = None
    outcome: Optional[DisposeOutcome] = None
    confirm_open_overlap: bool = False  # must be true to dispose a case in an open overlap group


class CaseActionResult(BaseModel):
    case: CaseRead
    action: CaseActionEntry


class CaseInstitution(InstitutionLite):
    region: Region
    trust_id: Optional[int]
    trust_name: Optional[str]


class CaseDetail(BaseModel):
    """GET /cases/{id}: the case, its institution, timeline and overlap groups (`cases` excludes this one)."""

    case: CaseRead
    institution: Optional[CaseInstitution]  # null while unresolved
    actions: List[CaseActionEntry]
    overlaps: List[OverlapSummary]


class CaseIntakeResult(BaseModel):
    """PRD §5 `CaseIntakeResult`: POST /cases → 201 (`overlaps[].cases` excludes the new case)."""

    case: CaseRead
    resolution: Resolution
    overlaps: List[OverlapSummary]


class CategorySuggestion(BaseModel):
    """PRD §5 `POST /cases/{id}/classify`: the suggested category and the model's confidence (not a probability)."""

    category_id: int
    category_code: str
    category_name: str
    confidence: float = PydanticField(ge=0, le=1)


class OpenOverlapErrorDetails(BaseModel):
    """`error.details` of 409 OPEN_OVERLAP."""

    case_ref: str
    group_ids: List[int]
    linked_case_refs: List[str]
