"""Text embeddings: sentence-transformers, or TF-IDF char n-grams offline (PRD §1, A8). Implemented in #20."""

from __future__ import annotations

from typing import Any, Literal, Protocol, Sequence

EmbeddingsMode = Literal["model", "tfidf"]


class Embedder(Protocol):
    """Turns texts into L2-normalized vectors, so cosine similarity is a dot product."""

    mode: EmbeddingsMode

    def fit(self, corpus: Sequence[str]) -> None:
        """Fit on institution names + case descriptions (needed by `tfidf`; a no-op for `model`)."""
        ...

    def encode(self, texts: Sequence[str]) -> Any:
        """Return an L2-normalized numpy array of shape (len(texts), dim)."""
        ...


def make_embedder(mode: EmbeddingsMode, model_name: str) -> Embedder:
    """`model` loads `model_name` once; `tfidf` uses char 3–5 grams with no download."""
    raise NotImplementedError("Implemented in #20")
