"""Database engine, session dependency, and initialization utilities using SQLModel."""

from typing import Annotated, Generator
from fastapi import Depends
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import get_settings

settings = get_settings()

# Configure SQLite-specific parameters when SQLite is used
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG and settings.ENVIRONMENT == "development",
    connect_args=connect_args,
)


def init_db(target_engine=None) -> None:
    """
    Initialize database schema by creating all registered tables.
    Safe to call at application startup; will not alter or drop existing tables.
    """
    # Import models here to guarantee all SQLModel metadata is registered before create_all
    import app.models  # noqa: F401

    eng = target_engine or engine
    SQLModel.metadata.create_all(eng)


def reset_db(target_engine=None) -> None:
    """
    Drop and recreate all registered tables.
    Used for testing suites and demo reset routines.
    """
    import app.models  # noqa: F401

    eng = target_engine or engine
    SQLModel.metadata.drop_all(eng)
    SQLModel.metadata.create_all(eng)


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency yielding an active SQLModel session."""
    with Session(engine) as session:
        yield session


# Type alias for dependency injection in route handlers
SessionDep = Annotated[Session, Depends(get_session)]
