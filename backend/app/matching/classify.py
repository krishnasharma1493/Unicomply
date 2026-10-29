"""
Complaint category suggestion (PRD §1A N1, §12.5): word 1-2 gram TF-IDF into a balanced `LinearSVC`.

Pure Python like the rest of the engine package: strings in, a code and a confidence out. The model is
trained at seed time on labelled synthetic descriptions and saved with joblib; a missing or unreadable
file means the feature is off (`load` returns None), never an error. The confidence is a softmax over the
SVM margins. It ranks the classes for one text and is not a calibrated probability.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

logger = logging.getLogger("unicomply.matching")

MODEL_FORMAT = 1  # bump when the saved shape changes; older files then load as None
MIN_EXAMPLES = 20


@dataclass(frozen=True)
class Suggestion:
    code: str
    confidence: float


class CategoryClassifier:
    def __init__(self, pipeline: Pipeline) -> None:
        self.pipeline = pipeline

    @property
    def codes(self) -> List[str]:
        return [str(c) for c in self.pipeline.classes_]

    def suggest(self, text: str) -> Suggestion:
        return self.suggest_many([text])[0]

    def suggest_many(self, texts: Sequence[str]) -> List[Suggestion]:
        margins = np.atleast_2d(self.pipeline.decision_function([t or " " for t in texts]))
        if margins.shape[1] == 1:  # binary SVM: one margin for the positive class
            margins = np.hstack([-margins, margins])
        shifted = np.exp(margins - margins.max(axis=1, keepdims=True))
        probs = shifted / shifted.sum(axis=1, keepdims=True)
        classes = self.codes
        top = probs.argmax(axis=1)
        return [Suggestion(classes[i], round(float(probs[row, i]), 4)) for row, i in enumerate(top)]

    def accuracy(self, texts: Sequence[str], codes: Sequence[str]) -> float:
        if not texts:
            return 0.0
        hits = sum(1 for s, c in zip(self.suggest_many(texts), codes) if s.code == c)
        return hits / len(texts)


def train(texts: Sequence[str], codes: Sequence[str]) -> CategoryClassifier:
    if len(texts) != len(codes):
        raise ValueError("texts and codes must have the same length")
    if len(texts) < MIN_EXAMPLES or len(set(codes)) < 2:
        raise ValueError(f"need at least {MIN_EXAMPLES} examples and 2 categories to train")
    pipeline = Pipeline(
        [
            ("tfidf", TfidfVectorizer(analyzer="word", ngram_range=(1, 2), lowercase=True, sublinear_tf=True)),
            ("svm", LinearSVC(class_weight="balanced")),
        ]
    )
    pipeline.fit(list(texts), list(codes))
    return CategoryClassifier(pipeline)


def save(model: CategoryClassifier, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    joblib.dump({"format": MODEL_FORMAT, "pipeline": model.pipeline}, tmp)
    tmp.replace(path)  # readers never see a half-written file


def load(path: Path) -> Optional[CategoryClassifier]:
    """The saved model, or None when the file is missing, from another format or unreadable."""
    if not path.exists():
        return None
    try:
        payload: Dict[str, object] = joblib.load(path)
        if payload.get("format") != MODEL_FORMAT:
            logger.warning("category model %s has format %r, expected %d; classifier off", path.name, payload.get("format"), MODEL_FORMAT)
            return None
        return CategoryClassifier(payload["pipeline"])
    except Exception:  # a corrupt cache file must not take intake down
        logger.warning("category model %s could not be read; classifier off", path.name, exc_info=True)
        return None

