from typing import Dict

from fastapi import APIRouter

from app.core.db import SessionDep
from app.core.deps import AdminUser
from app.core.schemas import Envelope, error_responses
from app.modules.engine.service import reset_indexes
from app.seed import reset_and_seed

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/reset", response_model=Envelope[Dict[str, str]], responses=error_responses(401, 403))
def reset_demo(_: AdminUser, session: SessionDep) -> Envelope[Dict[str, str]]:
    """Drop every table and reload the seed (senior officer / admin only)."""
    engine = session.get_bind().engine  # the request's engine (overridden in tests)
    session.close()  # release the connection before dropping tables
    reset_and_seed(engine)
    reset_indexes()  # aliases, cases and dismissals in memory belong to the old data
    return Envelope(data={"status": "reset"})
