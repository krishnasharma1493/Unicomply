from typing import Optional

from sqlmodel import Field, SQLModel

from app.core.enums import Region, Role
from app.modules.users.models import UserBase


class UserCreate(UserBase):
    pass


class UserUpdate(SQLModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    role: Optional[Role] = None
    bureau_id: Optional[int] = None
    region: Optional[Region] = None
    is_admin: Optional[bool] = None


class UserRead(SQLModel):
    """`/users/me` and login payload (contract: `UserMe` in frontend/src/lib/api/types.ts)."""

    id: int
    email: str
    name: str
    role: Role
    bureau_id: Optional[int]
    region: Optional[Region]
    is_admin: bool
