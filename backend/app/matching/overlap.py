"""Overlap detection: pair scores, levels, tiers, issue clusters, group plans (PRD §4.5). Implemented in #22."""

from __future__ import annotations

from typing import List, Sequence

from app.matching.index import MatchIndex
from app.matching.types import (
    CaseLite,
    GroupLite,
    GroupPlan,
    IssueCluster,
    Level,
    PairEvidence,
    Thresholds,
)


def pair_score(new: CaseLite, other: CaseLite, level: Level, idx: MatchIndex, th: Thresholds) -> float:
    """w_level × (text·s_text + category·s_category + time·e^(−Δt/decay)), in [0, 1]."""
    raise NotImplementedError("Implemented in #22")


def detect_overlaps(
    new: CaseLite, related: Sequence[CaseLite], idx: MatchIndex, th: Thresholds
) -> List[PairEvidence]:
    """
    Compare `new` with cases already filtered by anchor + window. Institution-level
    cross-bureau pairs are always returned; any other pair only if score ≥ t_possible.
    Dismissed pairs are never returned.
    """
    raise NotImplementedError("Implemented in #22")


def issue_clusters(
    case_ids: Sequence[int], pairs: Sequence[PairEvidence], t_possible: float
) -> List[IssueCluster]:
    """Complete linkage: a case joins a cluster only if it passes t_possible with every member."""
    raise NotImplementedError("Implemented in #22")


def plan_group_updates(
    new: CaseLite,
    evidence: Sequence[PairEvidence],
    existing: Sequence[GroupLite],
    idx: MatchIndex,
    th: Thresholds,
) -> List[GroupPlan]:
    """
    Turn pair evidence into group upserts anchored on the registry (Permanent ID, parent or
    trust): extend an open/confirmed group, reopen a dismissed one with only the new pairs,
    or create one. Never merges groups by chaining pairs (no transitive closure).
    """
    raise NotImplementedError("Implemented in #22")
