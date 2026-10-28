"""Local semantic vectors: multilingual sentence-transformers or offline character TF-IDF."""

from __future__ import annotations

import logging
from typing import Any, Literal, Protocol, Sequence

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

EmbeddingsMode = Literal["model", "tfidf"]

logger = logging.getLogger("unicomply.matching")


class Embedder(Protocol):
    mode: EmbeddingsMode

    def fit(self, corpus: Sequence[str]) -> None: ...

    def encode(self, texts: Sequence[str]) -> np.ndarray: ...


class _TfidfEmbedder:
    mode: EmbeddingsMode = "tfidf"

    def __init__(self) -> None:
        self.vectorizer = TfidfVectorizer(analyzer="char", ngram_range=(3, 5), lowercase=True, sublinear_tf=True)
        self.fitted = False

    def fit(self, corpus: Sequence[str]) -> None:
        rows = [text.strip() or " " for text in corpus]
        if not rows:
            rows = ["unicomply"]
        self.vectorizer.fit(rows)
        self.fitted = True

    def encode(self, texts: Sequence[str]) -> np.ndarray:
        if not self.fitted:
            self.fit(texts)
        if not texts:
            return np.zeros((0, len(self.vectorizer.vocabulary_)), dtype=np.float32)
        matrix = self.vectorizer.transform([text.strip() or " " for text in texts])
        dense: np.ndarray = normalize(matrix, norm="l2", copy=False).toarray()
        return dense.astype(np.float32, copy=False)


class _SentenceTransformerEmbedder:
    mode: EmbeddingsMode = "model"

    def __init__(self, model_name: str) -> None:
        self.model_name = model_name
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise RuntimeError(
                "EMBEDDINGS_MODE=model requires sentence-transformers; install it or use EMBEDDINGS_MODE=tfidf"
            ) from exc
        self.model = SentenceTransformer(model_name)

    def fit(self, corpus: Sequence[str]) -> None:
        return None

    def encode(self, texts: Sequence[str]) -> np.ndarray:
        vectors = self.model.encode(list(texts), convert_to_numpy=True, normalize_embeddings=True)
        return np.asarray(vectors, dtype=np.float32)


def make_embedder(mode: EmbeddingsMode, model_name: str, fallback: bool = True) -> Any:
    """
    The embedder for `mode`. If the sentence-transformers model cannot be loaded (package missing, model folder
    missing, no network to download it), fall back to TF-IDF with one clear log line, so the app still starts and
    the hero still works on stage with no Wi-Fi (PRD A8, §10B). `fallback=False` raises instead; the accuracy
    harness uses it so a report never claims `model` while running `tfidf`.
    """
    if mode == "tfidf":
        return _TfidfEmbedder()
    if mode == "model":
        try:
            return _SentenceTransformerEmbedder(model_name)
        except Exception as exc:  # ImportError, OSError (no model / no network), a corrupt download, ...
            if not fallback:
                raise
            logger.warning(
                "Embedding model %r is unavailable (%s: %s); falling back to EMBEDDINGS_MODE=tfidf. "
                "The matching engine still works offline; scores differ slightly from model mode.",
                model_name, type(exc).__name__, exc,
            )
            return _TfidfEmbedder()
    raise ValueError(f"Unsupported embedding mode: {mode}")
