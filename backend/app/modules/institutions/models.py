"""The institution registry: trusts, institutions (AICTE Permanent ID) and learned aliases (PRD §4.1)."""

from datetime import datetime
from typing import Annotated, Optional

from pydantic import StringConstraints
from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel

from app.core.enums import AliasSource, InstType, Region
from app.utils.time import utcnow

PERMANENT_ID_PATTERN = r"^1-\d{6,10}$"
# Use this type for validation: SQLModel's Field(regex=...) is silently ignored (sqlmodel 0.0.48).
PermanentIdStr = Annotated[str, StringConstraints(pattern=PERMANENT_ID_PATTERN, max_length=12)]


class TrustBase(SQLModel):
    name: str = Field(min_length=2, max_length=200)
    address: str = Field(max_length=300)
    state: str = Field(max_length=60)


class Trust(TrustBase, table=True):
    """One trust runs many institutions → trust-level overlap."""

    id: Optional[int] = Field(default=None, primary_key=True)


class InstitutionBase(SQLModel):
    name: str = Field(min_length=3, max_length=300)
    name_norm: str = Field(index=True, max_length=300)
    acronym: Optional[str] = Field(default=None, index=True, max_length=20)
    address: str = Field(max_length=300)
    district: str = Field(index=True, max_length=60)
    state: str = Field(index=True, max_length=60)
    pin: str = Field(max_length=10)
    region: Region = Field(index=True)
    inst_type: InstType
    year_est: Optional[int] = Field(default=None, ge=1800, le=2100)
    trust_id: Optional[int] = Field(default=None, foreign_key="trust.id", index=True)
    # A university department points at its university (parent-level overlap).
    parent_id: Optional[str] = Field(
        default=None, foreign_key="institution.permanent_id", index=True, max_length=12
    )
    is_active: bool = True


class Institution(InstitutionBase, table=True):
    # `1-XXXXXXXXXX`; validated by InstitutionCreate (table models don't validate on init).
    permanent_id: str = Field(primary_key=True, max_length=12)


class InstitutionAliasBase(SQLModel):
    permanent_id: str = Field(foreign_key="institution.permanent_id", index=True, max_length=12)
    alias_norm: str = Field(index=True, min_length=1, max_length=300)
    source: AliasSource


class InstitutionAlias(InstitutionAliasBase, table=True):
    """Grows each time a reviewer confirms a match (PRD §4.4 step 6)."""

    __tablename__ = "institution_alias"  # type: ignore[assignment]
    __table_args__ = (UniqueConstraint("permanent_id", "alias_norm"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    created_by: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow)
