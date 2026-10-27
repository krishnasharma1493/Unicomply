from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser
from app.core.fixtures import fixture
from app.core.schemas import Envelope, Page, error_responses
from app.modules.alerts.schemas import AlertListParams, AlertRead, ReadAllResult

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=Page[AlertRead], responses=error_responses(400, 401))
def list_alerts(_: CurrentUser, params: Annotated[AlertListParams, Query()]) -> Page[AlertRead]:
    """The caller's own alerts, newest first.

    Stub (#7): serves contract/fixtures/get_alerts.json until #13.
    """
    return fixture("get_alerts", Page[AlertRead])


@router.post("/read-all", response_model=Envelope[ReadAllResult], responses=error_responses(401))
def read_all_alerts(_: CurrentUser) -> Envelope[ReadAllResult]:
    """Mark every one of the caller's alerts as read.

    Stub (#7): serves contract/fixtures/post_alerts_read_all.json until #13.
    """
    return fixture("post_alerts_read_all", Envelope[ReadAllResult])


@router.post("/{alert_id}/read", response_model=Envelope[AlertRead], responses=error_responses(401, 404))
def read_alert(_: CurrentUser, alert_id: int) -> Envelope[AlertRead]:
    """Mark one of the caller's alerts as read.

    Stub (#7): serves contract/fixtures/post_alerts_id_read.json until #13.
    """
    return fixture("post_alerts_id_read", Envelope[AlertRead])
