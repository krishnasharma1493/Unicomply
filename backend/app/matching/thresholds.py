"""Weights and cutoffs from seed_data/thresholds.json plus env overrides (PRD §3, §9). Implemented in #19."""

from __future__ import annotations

from pathlib import Path
from typing import Mapping, Optional

from app.matching.types import Thresholds


def load_thresholds(
    path: Optional[Path] = None,
    overrides: Optional[Mapping[str, Optional[float]]] = None,
) -> Thresholds:
    """
    Read seed_data/thresholds.json, apply the non-None env overrides
    (MATCH_T_AUTO, MATCH_T_REVIEW, OVERLAP_T_PROBABLE, OVERLAP_T_POSSIBLE)
    and return validated `Thresholds`. Raises ValueError on an invalid combination.
    """
    raise NotImplementedError("Implemented in #19")
