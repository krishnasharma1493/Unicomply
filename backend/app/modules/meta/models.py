"""Reference tables: bureaus / cells / Regional Offices and complaint categories (PRD §4.1)."""

from typing import Optional

from sqlmodel import Field, SQLModel

from app.core.enums import BureauKind, Region


class BureauBase(SQLModel):
    code: str = Field(index=True, unique=True, min_length=2, max_length=20)  # RB, PGRC, RO-CRO, …
    name: str = Field(min_length=2, max_length=120)
    kind: BureauKind
    region: Optional[Region] = None  # set for Regional Offices


class Bureau(BureauBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


class CategoryBase(SQLModel):
    code: str = Field(index=True, unique=True, min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=80)
    default_sla_days: int = Field(ge=1, le=365)
    default_bureau_code: str = Field(max_length=20)


class Category(CategoryBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
