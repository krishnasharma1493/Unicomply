from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel

from app.modules.alerts.models import AlertBase


class AlertCreate(AlertBase):
    pass


class AlertUpdate(SQLModel):
    is_read: Optional[bool] = None


class AlertRead(AlertBase):
    id: int
    is_read: bool
    created_at: datetime
