from fastapi import APIRouter
from sqlmodel import Session, col, select

from app.core.db import SessionDep
from app.core.deps import CurrentUser
from app.core.enums import ActionType, CaseStatus, ComplainantType, DisposeOutcome, InstType, Region, SourceChannel
from app.core.schemas import Envelope, error_responses
from app.modules.meta.models import Bureau, Category
from app.modules.meta.schemas import BureauRead, CategoryRead, CodeName, Meta, Officer
from app.modules.users.models import User
from app.core.enums import Role
from app.utils.time import today

router = APIRouter(prefix="/meta", tags=["meta"])


def _label(code: str) -> str:
    return code.replace("_", " ").replace("-", " ").title()


def _code_names(enum_type):
    return [CodeName(code=value, name=_label(value.value)) for value in enum_type]


@router.get("", response_model=Envelope[Meta], responses=error_responses(401))
def get_meta(_: CurrentUser, session: SessionDep) -> Envelope[Meta]:
    """Live option lists for all form dropdowns, plus the configured demo date."""
    bureaus = session.exec(select(Bureau).order_by(col(Bureau.id))).all()
    categories = session.exec(select(Category).order_by(col(Category.id))).all()
    officers = session.exec(select(User).where(User.role == Role.case_officer).order_by(col(User.name))).all()
    return Envelope(data=Meta(
        bureaus=[BureauRead.model_validate(row) for row in bureaus],
        regions=_code_names(Region),
        categories=[CategoryRead.model_validate(row) for row in categories],
        statuses=_code_names(CaseStatus),
        channels=_code_names(SourceChannel),
        action_types=_code_names(ActionType),
        complainant_types=_code_names(ComplainantType),
        dispose_outcomes=_code_names(DisposeOutcome),
        inst_types=_code_names(InstType),
        officers=[Officer(id=row.id, name=row.name, bureau_id=row.bureau_id) for row in officers if row.id and row.bureau_id],
        today=today(),
    ))
