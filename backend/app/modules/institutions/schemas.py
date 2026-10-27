from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.core.enums import InstType, Region
from app.modules.institutions.models import (
    PermanentIdStr,
    InstitutionAliasBase,
    InstitutionBase,
    TrustBase,
)


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
