from typing import Annotated, List

from fastapi import APIRouter, Query

from app.core.db import SessionDep
from app.core.deps import CurrentUser
from app.core.schemas import Envelope, error_responses
from app.modules.dashboard import service
from app.modules.dashboard.schemas import (
    AgeingBucket,
    DashboardInstitutionsParams,
    DashboardSummary,
    InstitutionStatusRow,
    WorkloadRow,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=Envelope[DashboardSummary], responses=error_responses(401))
def get_summary(user: CurrentUser, session: SessionDep) -> Envelope[DashboardSummary]:
    """The 8 KPI cards, counted over the cases in the caller's scope."""
    return Envelope(data=service.summary(session, user))


@router.get("/workload", response_model=Envelope[List[WorkloadRow]], responses=error_responses(401))
def get_workload(user: CurrentUser, session: SessionDep) -> Envelope[List[WorkloadRow]]:
    """Open cases per bureau, split by status."""
    return Envelope(data=service.workload(session, user))


@router.get("/ageing", response_model=Envelope[List[AgeingBucket]], responses=error_responses(401))
def get_ageing(user: CurrentUser, session: SessionDep) -> Envelope[List[AgeingBucket]]:
    """Open cases in the 0–7 / 8–14 / 15–21 / 22–45 / 45+ day buckets."""
    return Envelope(data=service.ageing(session, user))


@router.get(
    "/institutions", response_model=Envelope[List[InstitutionStatusRow]], responses=error_responses(400, 401)
)
def get_institution_status(
    user: CurrentUser, session: SessionDep, params: Annotated[DashboardInstitutionsParams, Query()]
) -> Envelope[List[InstitutionStatusRow]]:
    """Top institutions by open cases, with a status split."""
    return Envelope(data=service.institutions(session, user, params.limit))
