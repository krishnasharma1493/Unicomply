"""Main FastAPI application entrypoint for Unicomply."""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Depends, FastAPI, status
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import Settings, get_settings, load_and_validate_settings
from app.core.db import init_db
from app.core.errors import register_error_handlers
from app.core.schemas import HealthData
from app.modules.auth.router import router as auth_router
from app.modules.demo.router import router as demo_router
from app.modules.users.router import router as users_router
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
        except Exception:
            logger.exception("Database initialization failed")

        yield

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
    for module_router in (auth_router, users_router, demo_router):
        api_v1_router.include_router(module_router)
    application.include_router(api_v1_router, prefix=settings.API_V1_PREFIX)

    return application


# Global application instance for uvicorn app.main:app
app = create_app()
