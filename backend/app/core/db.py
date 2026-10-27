"""Database engine, session dependency, and initialization utilities using SQLModel."""

from typing import Annotated, Generator
from fastapi import Depends
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import get_settings

settings = get_settings()

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

# check_same_thread: FastAPI runs sync routes in a threadpool; timeout: wait instead of "database is locked".
# SQL echo stays off: it would log bound parameters such as complaint text (PRD §6).
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 15} if _is_sqlite else {},
)


def sqlite_savepoints(target: Engine) -> Engine:
    """
    Make SAVEPOINT work on SQLite. The driver delays BEGIN until the first write, so a savepoint
    taken first (create_alert's duplicate guard) would release into autocommit and break the
    caller's rollback. This is the SQLAlchemy-documented recipe: the driver stops managing
    transactions and we emit BEGIN ourselves.
    """

    @event.listens_for(target, "connect")
    def _no_driver_begin(dbapi_connection, _record):  # type: ignore[no-untyped-def]
        dbapi_connection.isolation_level = None

    @event.listens_for(target, "begin")
    def _begin(conn):  # type: ignore[no-untyped-def]
        conn.exec_driver_sql("BEGIN")

    return target


if _is_sqlite:
    sqlite_savepoints(engine)


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
