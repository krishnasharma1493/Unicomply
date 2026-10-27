from typing import Annotated, List

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser
from app.core.fixtures import fixture
from app.core.schemas import Envelope, error_responses
from app.modules.dashboard.schemas import (
    AgeingBucket,
    DashboardInstitutionsParams,
    DashboardSummary,
    InstitutionStatusRow,
    WorkloadRow,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=Envelope[DashboardSummary], responses=error_responses(401))
def get_summary(_: CurrentUser) -> Envelope[DashboardSummary]:
    """The 8 KPI cards, scoped to the caller.

    Stub (#7): serves contract/fixtures/get_dashboard_summary.json until #36.
    """
    return fixture("get_dashboard_summary", Envelope[DashboardSummary])


@router.get("/workload", response_model=Envelope[List[WorkloadRow]], responses=error_responses(401))
def get_workload(_: CurrentUser) -> Envelope[List[WorkloadRow]]:
    """Open cases per bureau, split by status.

    Stub (#7): serves contract/fixtures/get_dashboard_workload.json until #36.
    """
    return fixture("get_dashboard_workload", Envelope[List[WorkloadRow]])


@router.get("/ageing", response_model=Envelope[List[AgeingBucket]], responses=error_responses(401))
def get_ageing(_: CurrentUser) -> Envelope[List[AgeingBucket]]:
    """Open cases in the 0–7 / 8–14 / 15–21 / 22–45 / 45+ day buckets.

    Stub (#7): serves contract/fixtures/get_dashboard_ageing.json until #36.
    """
    return fixture("get_dashboard_ageing", Envelope[List[AgeingBucket]])


@router.get(
    "/institutions", response_model=Envelope[List[InstitutionStatusRow]], responses=error_responses(400, 401)
)
def get_institution_status(
    _: CurrentUser, params: Annotated[DashboardInstitutionsParams, Query()]
) -> Envelope[List[InstitutionStatusRow]]:
    """Top institutions by open cases, with a status split.

    Stub (#7): serves contract/fixtures/get_dashboard_institutions.json until #36.
    """
    return fixture("get_dashboard_institutions", Envelope[List[InstitutionStatusRow]])
