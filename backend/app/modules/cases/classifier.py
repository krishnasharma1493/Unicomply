"""
Category suggestion for intake (PRD §1A N1): the platform side of `app.matching.classify`.

The model is trained at seed time and read from one joblib file. It is optional everywhere: with the flag
off or the file missing, `suggest` returns None and intake behaves as before.
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from sqlmodel import Session, select

from app.core.config import get_settings
from app.matching import classify
from app.modules.meta.models import Category

logger = logging.getLogger("unicomply.cases")

_loaded: Dict[Path, Tuple[float, Optional[classify.CategoryClassifier]]] = {}


def model_path() -> Path:
    configured = get_settings().CLASSIFIER_MODEL_PATH
    return configured or Path(__file__).resolve().parents[3] / "seed_data" / ".cache" / "category-classifier.joblib"


def get_classifier() -> Optional[classify.CategoryClassifier]:
    """The model, or None when the feature is off or the file is missing. Reloads when the file changes."""
    if not get_settings().CLASSIFIER_ENABLED:
        return None
    path = model_path()
    stamp = path.stat().st_mtime if path.exists() else -1.0
    cached = _loaded.get(path)
    if cached is None or cached[0] != stamp:
        cached = (stamp, classify.load(path))
        _loaded[path] = cached
    return cached[1]


def suggest(session: Session, text: str) -> Optional[Tuple[Category, float]]:
    model = get_classifier()
    if model is None:
        return None
    suggestion = model.suggest(text)
    category = session.exec(select(Category).where(Category.code == suggestion.code)).first()
    return None if category is None else (category, suggestion.confidence)


def train_from_seed(seed_dir: Path) -> Optional[int]:
    """Train on the seed's labelled descriptions and save the model. Returns the example count, or None
    when the seed has too few labels (the tiny hero world), so the feature stays off there.

    When a ground truth file is present only its dev split is used, so the accuracy that `app.eval`
    reports on the test split describes this same model."""
    cases_file = seed_dir / "cases.json"
    categories_file = seed_dir / "categories.json"
    if not cases_file.exists() or not categories_file.exists():
        return None
    codes = {c["id"]: c["code"] for c in json.loads(categories_file.read_text(encoding="utf-8"))["categories"]}
    cases = json.loads(cases_file.read_text(encoding="utf-8"))["cases"]
    truth_file = seed_dir / "ground_truth.json"
    if truth_file.exists():
        dev = set(json.loads(truth_file.read_text(encoding="utf-8"))["dev_case_ids"])
        cases = [c for c in cases if c["id"] in dev]
    texts: List[str] = [f'{c["subject"]}. {c["description"]}' for c in cases]
    labels = [codes[c["category_id"]] for c in cases]
    try:
        model = classify.train(texts, labels)
    except ValueError:
        return None
    classify.save(model, model_path())
    _loaded.pop(model_path(), None)
    logger.info("category classifier trained on %d examples", len(texts))
    return len(texts)
