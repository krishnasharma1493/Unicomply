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
from app.utils.time import iso_utcnow

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
            environment=settings.ENVIRONMENT,
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
            f"Starting {settings.PROJECT_NAME} in '{settings.ENVIRONMENT}' environment"
        )
        # Ensure database tables are created at startup without destructive resets
        try:
            init_db()
            logger.info("Database initialized successfully.")
        except Exception as e:
            logger.warning(f"Database initialization deferred or encountered warning: {e}")

        yield

        logger.info(f"Shutting down {settings.PROJECT_NAME}")

    application = FastAPI(
        title=settings.PROJECT_NAME,
        description=(
            "AICTE Complaint Tracking and Cross-Bureau Overlap Detection Dashboard API."
        ),
        version="0.1.0",
        debug=settings.DEBUG,
        lifespan=lifespan,
    )

    # 1. Register base CORS middleware
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 2. Register global error handlers (AppError, ValidationError, HTTPException, 500s)
    register_error_handlers(application)

    # 3. Mount root health endpoint at /health
    health_router = create_health_router()
    application.include_router(health_router)

    # 4. Mount API v1 router and include versioned health at /api/v1/health
    api_v1_router = APIRouter()
    api_v1_router.include_router(create_health_router())
    application.include_router(api_v1_router, prefix=settings.API_V1_PREFIX)

    return application


# Global application instance for uvicorn app.main:app
app = create_app()
