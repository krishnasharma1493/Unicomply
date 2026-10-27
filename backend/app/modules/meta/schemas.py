from typing import Optional

from sqlmodel import Field, SQLModel

from app.core.enums import BureauKind, Region
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
