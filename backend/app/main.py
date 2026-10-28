"""Main FastAPI application entrypoint for Unicomply."""

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Dict, Optional

from fastapi import APIRouter, Depends, FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from app.core.config import Settings, get_settings, load_and_validate_settings
from app.core.db import init_db
from app.core.db import engine as db_engine
from app.core.errors import register_error_handlers
from app.core.schemas import HealthData
from app.jobs import job_loop
from app.modules.alerts.router import router as alerts_router
from app.modules.auth.router import router as auth_router
from app.modules.cases.router import router as cases_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.demo.router import router as demo_router
from app.modules.institutions.router import router as institutions_router
from app.modules.meta.router import router as meta_router
from app.modules.overlaps.router import router as overlaps_router
from app.modules.reports.router import router as reports_router
from app.modules.reviews.router import router as reviews_router
from app.modules.users.router import router as users_router
from app.modules.engine.service import current_index
from app.seed import seed_if_empty
from app.utils.time import iso_utcnow

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("unicomply.app")


def create_health_router() -> APIRouter:
    """Create reusable health router for root and API versioned endpoints."""
    router = APIRouter(tags=["Health"])

    @router.get(
        "/health",
        response_model=HealthData,
        status_code=status.HTTP_200_OK,
        summary="Service Health Check",
        description="Verify service availability, active runtime environment, and current time.",
    )
    async def get_health(settings: Settings = Depends(get_settings)) -> HealthData:
        return HealthData(
            status="ok",
            timestamp=iso_utcnow(),
            environment=settings.APP_ENV,
            version="0.1.0",
        )

    return router


def create_app(custom_settings: Optional[Settings] = None) -> FastAPI:
    """
    Factory function to initialize and configure the FastAPI application.
    """
    settings = custom_settings or load_and_validate_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        """Lifespan context manager for application startup and graceful shutdown."""
        logger.info(
            f"Starting {settings.PROJECT_NAME} in '{settings.APP_ENV}' environment"
        )
        # Create tables (never destructive) and, if enabled, load the demo data into an empty DB
        try:
            if settings.SEED_ON_STARTUP and seed_if_empty():
                logger.info("Database was empty: demo data loaded.")
            else:
                init_db()
                logger.info("Database initialized successfully.")
            from sqlmodel import Session

            with Session(db_engine) as session:
                current_index(session)
            logger.info("Institution and case matching index is ready.")
        except Exception:
            logger.exception("Database initialization failed")

        # SLA, reminder and re-scan work (PRD §4.6), off unless ENABLE_SCHEDULER
        job_task = asyncio.create_task(job_loop(db_engine, settings)) if settings.ENABLE_SCHEDULER else None

        yield

        if job_task is not None:
            job_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await job_task

        logger.info(f"Shutting down {settings.PROJECT_NAME}")

    application = FastAPI(
        title=settings.PROJECT_NAME,
        description=(
            "AICTE Complaint Tracking and Cross-Bureau Overlap Detection Dashboard API."
        ),
        version="0.1.0",
        lifespan=lifespan,
        # debug stays off: Starlette's debug mode returns raw tracebacks on 500s.
    )

    # 1. CORS — explicit origins only; no cookies are used, so credentials stay off
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    # 2. Register global error handlers (AppError, ValidationError, HTTPException, 500s)
    register_error_handlers(application)

    # 3. Mount root health endpoint at /health
    health_router = create_health_router()
    application.include_router(health_router)

    # 4. Mount API v1 router and include versioned health at /api/v1/health
    api_v1_router = APIRouter()
    api_v1_router.include_router(create_health_router())
    for module_router in (
        auth_router,
        users_router,
        meta_router,
        institutions_router,
        cases_router,
        reviews_router,
        overlaps_router,
        alerts_router,
        dashboard_router,
        reports_router,
        demo_router,
    ):
        api_v1_router.include_router(module_router)
    application.include_router(api_v1_router, prefix=settings.API_V1_PREFIX)

    _document_validation_as_400(application)
    return application


def _document_validation_as_400(application: FastAPI) -> None:
    """
    FastAPI documents a 422 on every route with params or a body, but our handler returns
    400 VALIDATION_ERROR in the standard error shape (base blueprint §4). Drop the 422s
    from /docs so the contract shows what clients actually receive.
    """

    def openapi() -> Dict[str, Any]:
        if application.openapi_schema is None:
            schema = get_openapi(
                title=application.title,
                version=application.version,
                description=application.description,
                routes=application.routes,
            )
            for path_item in schema.get("paths", {}).values():
                for operation in path_item.values():
                    operation.get("responses", {}).pop("422", None)
            for name in ("HTTPValidationError", "ValidationError"):
                schema.get("components", {}).get("schemas", {}).pop(name, None)
            application.openapi_schema = schema
        return application.openapi_schema

    application.openapi = openapi  # type: ignore[method-assign]


# Global application instance for uvicorn app.main:app
app = create_app()
