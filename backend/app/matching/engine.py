"""
The one object the service layer (#8) talks to. `get_engine("stub")` returns canned hero
results so endpoints and screens can be built before the algorithms exist;
`get_engine("real")` delegates to resolve.py / overlap.py (#21, #22). #38 flips the default.
"""

from __future__ import annotations

from typing import List, Optional, Protocol, Sequence

from app.matching import overlap, resolve
from app.matching.index import MatchIndex
from app.matching.types import (
    CaseLite,
    EngineMode,
    GroupLite,
    GroupPlan,
    PairEvidence,
    ResolutionResult,
    Thresholds,
)


class MatchingEngine(Protocol):
    """Same signatures as the module functions; the stub ignores `idx` and `th`."""

    name: EngineMode

    def resolve_institution(
        self,
        raw_text: str,
        raw_state: Optional[str],
        raw_district: Optional[str],
        idx: Optional[MatchIndex],
        th: Optional[Thresholds],
        top_k: int = 5,
    ) -> ResolutionResult: ...

    def detect_overlaps(
        self,
        new: CaseLite,
        related: Sequence[CaseLite],
        idx: Optional[MatchIndex],
        th: Optional[Thresholds],
    ) -> List[PairEvidence]: ...

    def plan_group_updates(
        self,
        new: CaseLite,
        evidence: Sequence[PairEvidence],
        existing: Sequence[GroupLite],
        idx: Optional[MatchIndex],
        th: Optional[Thresholds],
    ) -> List[GroupPlan]: ...


class RealEngine:
    """Delegates to the real algorithms; needs a built MatchIndex and loaded Thresholds."""

    name: EngineMode = "real"

    @staticmethod
    def _require(idx: Optional[MatchIndex], th: Optional[Thresholds]) -> tuple[MatchIndex, Thresholds]:
        if idx is None or th is None:
            raise ValueError("The real engine needs a MatchIndex and Thresholds")
        return idx, th

    def resolve_institution(
        self,
        raw_text: str,
        raw_state: Optional[str],
        raw_district: Optional[str],
        idx: Optional[MatchIndex],
        th: Optional[Thresholds],
        top_k: int = 5,
    ) -> ResolutionResult:
        index, thresholds = self._require(idx, th)
        return resolve.resolve_institution(raw_text, raw_state, raw_district, index, thresholds, top_k)

    def detect_overlaps(
        self,
        new: CaseLite,
        related: Sequence[CaseLite],
        idx: Optional[MatchIndex],
        th: Optional[Thresholds],
    ) -> List[PairEvidence]:
        index, thresholds = self._require(idx, th)
        return overlap.detect_overlaps(new, related, index, thresholds)

    def plan_group_updates(
        self,
        new: CaseLite,
        evidence: Sequence[PairEvidence],
        existing: Sequence[GroupLite],
        idx: Optional[MatchIndex],
        th: Optional[Thresholds],
    ) -> List[GroupPlan]:
        index, thresholds = self._require(idx, th)
        return overlap.plan_group_updates(new, evidence, existing, index, thresholds)


def get_engine(mode: EngineMode = "stub") -> MatchingEngine:
    """Return the engine for `mode` (the caller passes Settings.MATCHING_ENGINE)."""
    if mode == "stub":
        from app.matching.stub import StubEngine

        return StubEngine()
    if mode == "real":
        return RealEngine()
    raise ValueError(f"Unknown matching engine {mode!r}; expected 'stub' or 'real'")
