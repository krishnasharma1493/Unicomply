"""
Load the demo world from seed_data/*.json — run with: python -m app.seed [--reset]

The file format is documented in seed_data/README.md; the synthetic generator (#23) writes
the same files at scale (seed_data/), around the hand-written hero world (seed_data/tiny/). Files with an `as_of` date are shifted by `today() - as_of`, so
"PGRC/2026/00412 is on day 19 of 21" holds on any day (exactly the fixture dates when
DEMO_TODAY equals as_of). Ids come from the files, so they are stable across resets and
existing tokens keep working.
"""

from __future__ import annotations

import argparse
import json
import re
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, select

from app.core import db
from app.core.config import get_settings
from app.modules.alerts.models import Alert
from app.modules.cases.models import Case, CaseAction
from app.modules.institutions.models import Institution, InstitutionAlias, Trust
from app.modules.meta.models import Bureau, Category
from app.modules.overlaps.models import OverlapGroup, OverlapLink, OverlapPair
from app.modules.reviews.models import MatchReview
from app.modules.users.models import User
from app.utils.time import today as current_today

SEED_DIR = Path(__file__).resolve().parents[1] / "seed_data"  # the full synthetic world (#23)
TINY_SEED_DIR = SEED_DIR / "tiny"  # the hand-written hero world; fast, and what the tests run on

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$")
_EMBEDDED_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")


def _read(seed_dir: Path, name: str, required: bool = True) -> Optional[Dict[str, Any]]:
    path = seed_dir / name
    if not path.exists():
        if required:
            raise FileNotFoundError(f"Seed file missing: {path}")
        return None
    data: Dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    return data


def _shift(value: Any, days: int) -> Any:
    """Shift every ISO date / timestamp value (not text that merely contains one) by `days`."""
    if days == 0:
        return value
    if isinstance(value, dict):
        return {k: _shift(v, days) for k, v in value.items()}
    if isinstance(value, list):
        return [_shift(v, days) for v in value]
    if isinstance(value, str):
        if _DATE_RE.match(value):
            return (date.fromisoformat(value) + timedelta(days=days)).isoformat()
        if _DATETIME_RE.match(value):
            moved = datetime.fromisoformat(value.replace("Z", "+00:00")) + timedelta(days=days)
            return moved.isoformat().replace("+00:00", "Z")
    return value


def _rows(data: Dict[str, Any], key: str, today: date) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = data[key]
    if "as_of" not in data:
        return rows
    days = (today - date.fromisoformat(data["as_of"])).days
    return [_shift(row, days) for row in rows]


def _add_all(session: Session, objects: List[SQLModel]) -> None:
    session.add_all(objects)
    session.flush()  # insert in foreign-key order, stage by stage


def load_seed(session: Session, seed_dir: Path = SEED_DIR, today: Optional[date] = None) -> Dict[str, int]:
    """Insert every seed file into an empty schema in one transaction. Returns row counts."""
    today = today or current_today()
    counts: Dict[str, int] = {}

    bureaus = _read(seed_dir, "bureaus.json")["bureaus"]  # type: ignore[index]
    _add_all(session, [Bureau.model_validate(b) for b in bureaus])
    categories = _read(seed_dir, "categories.json")["categories"]  # type: ignore[index]
    _add_all(session, [Category.model_validate(c) for c in categories])
    users = _read(seed_dir, "users.json")["users"]  # type: ignore[index]
    _add_all(session, [User.model_validate({**u, "email": u["email"].strip().lower()}) for u in users])

    registry = _read(seed_dir, "institutions.json")
    assert registry is not None
    _add_all(session, [Trust.model_validate(t) for t in registry["trusts"]])
    # Universities before their departments (parent_id is a self reference).
    institutions = sorted(registry["institutions"], key=lambda i: i["parent_id"] is not None)
    _add_all(session, [Institution.model_validate(i) for i in institutions])
    _add_all(session, [InstitutionAlias.model_validate(a) for a in registry.get("aliases", [])])
    counts.update(
        bureaus=len(bureaus), categories=len(categories), users=len(users),
        trusts=len(registry["trusts"]), institutions=len(institutions),
        aliases=len(registry.get("aliases", [])),
    )

    case_data = _read(seed_dir, "cases.json")
    assert case_data is not None
    cases = _rows(case_data, "cases", today)
    _add_all(session, [Case.model_validate({k: v for k, v in c.items() if k != "actions"}) for c in cases])
    actions = [a for c in cases for a in c.get("actions", [])]
    _add_all(session, [CaseAction.model_validate(a) for a in actions])
    counts.update(cases=len(cases), case_actions=len(actions))

    review_data = _read(seed_dir, "reviews.json", required=False)
    reviews = _rows(review_data, "reviews", today) if review_data else []
    _add_all(session, [MatchReview.model_validate(r) for r in reviews])
    counts["match_reviews"] = len(reviews)

    overlap_data = _read(seed_dir, "overlaps.json", required=False)
    groups = _rows(overlap_data, "groups", today) if overlap_data else []
    pairs = _rows(overlap_data, "pairs", today) if overlap_data else []
    _add_all(session, [OverlapGroup.model_validate({k: v for k, v in g.items() if k != "links"}) for g in groups])
    links = [{**link, "group_id": g["id"]} for g in groups for link in g.get("links", [])]
    _add_all(session, [OverlapLink.model_validate(link) for link in links])
    _add_all(session, [OverlapPair.model_validate(p) for p in pairs])
    counts.update(overlap_groups=len(groups), overlap_links=len(links), overlap_pairs=len(pairs))

    alert_data = _read(seed_dir, "alerts.json", required=False)
    alerts = _rows(alert_data, "alerts", today) if alert_data else []
    if alert_data:
        # The day in dedupe_key (type:recipient:entity:date) moves with created_at.
        days = (today - date.fromisoformat(alert_data["as_of"])).days
        for a in alerts:
            a["dedupe_key"] = _EMBEDDED_DATE_RE.sub(
                lambda m: (date.fromisoformat(m.group(0)) + timedelta(days=days)).isoformat(), a["dedupe_key"]
            )
    _add_all(session, [Alert.model_validate(a) for a in alerts])
    counts["alerts"] = len(alerts)

    session.commit()
    return counts


def default_seed_dir() -> Path:
    """Where seeding and `POST /demo/reset` read from: SEED_SET=full (seed_data/) or tiny (seed_data/tiny/)."""
    return TINY_SEED_DIR if get_settings().SEED_SET == "tiny" else SEED_DIR


def _engine(target_engine: Optional[Engine]) -> Engine:
    return target_engine if target_engine is not None else db.engine  # looked up at call time


def _train_classifier(seed_dir: Path) -> None:
    """N1: fit the category model on the seed's labelled descriptions (the tiny world is too small and skips it)."""
    from app.modules.cases.classifier import train_from_seed

    if get_settings().CLASSIFIER_ENABLED:
        train_from_seed(seed_dir)


def seed_if_empty(target_engine: Optional[Engine] = None, seed_dir: Optional[Path] = None) -> bool:
    """Create tables and load the seed if there are no users yet. Returns True if it seeded."""
    eng = _engine(target_engine)
    db.init_db(eng)
    with Session(eng) as session:
        if session.exec(select(User)).first() is not None:
            return False
        load_seed(session, seed_dir or default_seed_dir())
    _train_classifier(seed_dir or default_seed_dir())
    return True


def reset_and_seed(target_engine: Optional[Engine] = None, seed_dir: Optional[Path] = None) -> Dict[str, int]:
    """Drop every table, recreate the schema and load the seed."""
    eng = _engine(target_engine)
    db.reset_db(eng)
    with Session(eng) as session:
        counts = load_seed(session, seed_dir or default_seed_dir())
    _train_classifier(seed_dir or default_seed_dir())
    return counts


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create tables and load the Unicomply demo data")
    parser.add_argument("--reset", action="store_true", help="drop all tables first")
    parser.add_argument("--tiny", action="store_true", help="load only the hand-written hero world (seed_data/tiny)")
    parser.add_argument("--seed-dir", type=Path, default=None, help="load a generated directory (python -m seed_data.generator --output)")
    args = parser.parse_args()
    chosen = args.seed_dir or (TINY_SEED_DIR if args.tiny else None)
    started = time.perf_counter()
    if args.reset:
        result = reset_and_seed(seed_dir=chosen)
        print(f"Demo data reset in {time.perf_counter() - started:.2f}s: {result}")
    elif seed_if_empty(seed_dir=chosen):
        print(f"Demo data loaded in {time.perf_counter() - started:.2f}s")
    else:
        print("Database already has data; nothing to do (use --reset to start over)")
