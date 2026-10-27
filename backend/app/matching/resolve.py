"""Institution resolution: messy name → Permanent ID with reasons (PRD §4.4). Implemented in #21."""

from __future__ import annotations

from typing import Optional

from app.matching.index import MatchIndex
from app.matching.types import ResolutionResult, Thresholds


def resolve_institution(
    raw_text: str,
    raw_state: Optional[str],
    raw_district: Optional[str],
    idx: MatchIndex,
    th: Thresholds,
    top_k: int = 5,
) -> ResolutionResult:
    """
    Exact tier first (Permanent ID in text → 1.0; exact name or confirmed alias → 0.99),
    then state blocking with a district location veto, then the weighted score.
    Decision: top ≥ t_auto with margin ≥ th.margin → auto; top ≥ t_review → pending_review;
    else unresolved. Returns the top_k candidates, best first, each with reasons.
    """
    raise NotImplementedError("Implemented in #21")
