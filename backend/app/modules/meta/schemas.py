from datetime import date
from typing import Generic, List, Optional, TypeVar

from pydantic import BaseModel
from sqlmodel import Field, SQLModel

from app.core.enums import (
    ActionType,
    BureauKind,
    CaseStatus,
    ComplainantType,
    DisposeOutcome,
    InstType,
    Region,
    SourceChannel,
)
from app.modules.meta.models import BureauBase, CategoryBase


class BureauCreate(BureauBase):
    pass


class BureauUpdate(SQLModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    kind: Optional[BureauKind] = None
    region: Optional[Region] = None


class BureauRead(BureauBase):
    id: int


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(SQLModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    default_sla_days: Optional[int] = Field(default=None, ge=1, le=365)
    default_bureau_code: Optional[str] = Field(default=None, max_length=20)


class CategoryRead(CategoryBase):
    id: int


# ── API contract (PRD §5) ────────────────────────────────────────────────

C = TypeVar("C")


class CodeName(BaseModel, Generic[C]):
    """A dropdown option: machine code + display name."""

    code: C
    name: str


class Officer(BaseModel):
    """A case officer (data only, no login, PRD §0): pick list for assign / coordinator."""

    id: int
    name: str
    bureau_id: int


class Meta(BaseModel):
    """GET /meta: every dropdown the UI needs."""

    bureaus: List[BureauRead]
    regions: List[CodeName[Region]]
    categories: List[CategoryRead]
    statuses: List[CodeName[CaseStatus]]
    channels: List[CodeName[SourceChannel]]
    action_types: List[CodeName[ActionType]]
    complainant_types: List[CodeName[ComplainantType]]
    dispose_outcomes: List[CodeName[DisposeOutcome]]
    inst_types: List[CodeName[InstType]]
    officers: List[Officer]
    today: date
