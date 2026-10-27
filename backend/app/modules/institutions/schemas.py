from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field as PydanticField
from sqlmodel import Field, SQLModel

from app.core.enums import InstType, Region, ResolutionDecision
from app.core.schemas import PageParams
from app.modules.institutions.models import (
    InstitutionAliasBase,
    InstitutionBase,
    PermanentIdStr,
    TrustBase,
)
from app.modules.overlaps.schemas import LinkedCaseCard, OverlapSummary

# ── Table schemas (#6) ───────────────────────────────────────────────────


class TrustCreate(TrustBase):
    pass


class TrustUpdate(SQLModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    address: Optional[str] = Field(default=None, max_length=300)
    state: Optional[str] = Field(default=None, max_length=60)


class TrustRead(TrustBase):
    id: int


class InstitutionCreate(InstitutionBase):
    permanent_id: PermanentIdStr


class InstitutionUpdate(SQLModel):
    name: Optional[str] = Field(default=None, min_length=3, max_length=300)
    name_norm: Optional[str] = Field(default=None, max_length=300)
    acronym: Optional[str] = Field(default=None, max_length=20)
    address: Optional[str] = Field(default=None, max_length=300)
    district: Optional[str] = Field(default=None, max_length=60)
    state: Optional[str] = Field(default=None, max_length=60)
    pin: Optional[str] = Field(default=None, max_length=10)
    region: Optional[Region] = None
    inst_type: Optional[InstType] = None
    year_est: Optional[int] = Field(default=None, ge=1800, le=2100)
    trust_id: Optional[int] = None
    parent_id: Optional[PermanentIdStr] = None
    is_active: Optional[bool] = None


class InstitutionRead(InstitutionBase):
    permanent_id: str


class InstitutionAliasCreate(InstitutionAliasBase):
    pass


class InstitutionAliasRead(InstitutionAliasBase):
    """Aliases are only added or removed, never edited, so there is no update schema."""

    id: int
    created_by: Optional[int]
    created_at: datetime


# ── API contract (PRD §5) ────────────────────────────────────────────────


class InstitutionLite(BaseModel):
    """Minimal institution reference (parent, departments, trust siblings)."""

    permanent_id: str
    name: str
    district: str
    state: str
    inst_type: InstType


class InstitutionListItem(InstitutionRead):
    """A registry row in GET /institutions."""

    trust_name: Optional[str]
    open_case_count: int


class InstitutionListParams(PageParams):
    q: Optional[str] = PydanticField(
        default=None, max_length=300, description="Name, acronym, alias or Permanent ID"
    )
    state: Optional[str] = PydanticField(default=None, max_length=60)
    region: Optional[Region] = None
    inst_type: Optional[InstType] = None


class CaseCounts(BaseModel):
    total: int
    open: int
    disposed: int
    beyond_sla: int


class BureauCaseColumn(BaseModel):
    bureau_id: int
    bureau_code: str
    bureau_name: str
    # Full CaseRead values in scope; reduced LinkedCaseCard values otherwise.
    cases: List[dict]


class Institution360(BaseModel):
    """GET /institutions/{permanent_id}: profile, family, cases by bureau, overlaps (PS feature 1)."""

    institution: InstitutionListItem
    trust: Optional[TrustRead]
    parent: Optional[InstitutionLite]
    departments: List[InstitutionLite]
    trust_institutions: List[InstitutionLite]
    case_counts: CaseCounts
    cases_by_bureau: List[BureauCaseColumn]
    overlap_groups: List[OverlapSummary]  # `cases` lists every member of each group


class ResolvePreviewIn(BaseModel):
    """POST /institutions/resolve body: the live preview while an operator types."""

    raw_text: str = PydanticField(min_length=3, max_length=300)
    state: Optional[str] = PydanticField(default=None, max_length=60)
    district: Optional[str] = PydanticField(default=None, max_length=60)


class Candidate(BaseModel):
    """PRD §5 `Candidate`: one ranked institution with plain-language reasons."""

    permanent_id: str
    name: str
    district: str
    state: str
    score: float = PydanticField(ge=0, le=1)
    reasons: List[str]


class Resolution(BaseModel):
    """PRD §5 `Resolution`: top-k candidates, best first."""

    decision: ResolutionDecision
    candidates: List[Candidate]
