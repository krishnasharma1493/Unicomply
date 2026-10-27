"""User accounts: the 5 demo personas plus case officers, who are data only (PRD §0, §4.1)."""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.core.enums import Region, Role
from app.utils.time import utcnow


class UserBase(SQLModel):
    email: str = Field(index=True, unique=True, min_length=3, max_length=254)
    name: str = Field(min_length=2, max_length=80)
    role: Role
    bureau_id: Optional[int] = Field(default=None, foreign_key="bureau.id")
    region: Optional[Region] = None  # RO officers: the region they see
    is_admin: bool = False  # the senior officer persona; gates /demo/reset


class User(UserBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=utcnow)
