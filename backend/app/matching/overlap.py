"""Registry-anchored overlap scoring, explanations and non-transitive group plans."""

from __future__ import annotations

import math
from typing import Dict, List, Sequence, Tuple

from app.matching.index import MatchIndex
from app.matching.types import (
    CaseLite, GroupAction, GroupLite, GroupPlan, IssueCluster, Level, PairEvidence, Thresholds, Tier,
)

_RELATED_CATEGORIES = (
    frozenset({"fee_refund", "certificate_withheld", "scholarship"}),
    frozenset({"faculty_shortage", "infrastructure_deficiency", "unapproved_course"}),
    frozenset({"ragging", "harassment"}),
)


def pair_score(new: CaseLite, other: CaseLite, level: Level, idx: MatchIndex, th: Thresholds) -> float:
    similarity = idx.description_similarity(new.id, other.id)
    if new.category_code == other.category_code:
        category = 1.0
    elif any({new.category_code, other.category_code}.issubset(cluster) for cluster in _RELATED_CATEGORIES):
        category = 0.5
    else:
        category = 0.0
    delta = abs((new.received_at - other.received_at).days)
    recency = math.exp(-delta / th.pair.time_decay_days)
    score = th.level.of(level) * (
        th.pair.text * similarity + th.pair.category * category + th.pair.time * recency
    )
    return min(1.0, max(0.0, score))


def detect_overlaps(
    new: CaseLite, related: Sequence[CaseLite], idx: MatchIndex, th: Thresholds
) -> List[PairEvidence]:
    evidence: List[PairEvidence] = []
    for other in related:
        if other.id == new.id or not new.permanent_id or not other.permanent_id:
            continue
        if idx.is_dismissed(new.id, other.id):
            continue
        level = idx.level_between(new.permanent_id, other.permanent_id)
        if level is None:
            continue
        score = pair_score(new, other, level, idx, th)
        cross_bureau = new.bureau_id != other.bureau_id
        institutional_cross = level == "institution" and cross_bureau and new.is_open and other.is_open
        # PRD §4.5: open cases of one institution handled by different bureaus are always compared; a recently
        # disposed one needs T_possible; same bureau, a sibling department or a sibling institution of the trust
        # need T_probable (a "possible duplicate" or a "possible" link).
        if institutional_cross:
            required = 0.0
        elif level == "institution" and cross_bureau:
            required = th.t_possible
        else:
            required = th.t_probable
        if score < required:
            continue
        reasons = _reasons(new, other, level, score, idx)
        evidence.append(PairEvidence.of(new.id, other.id, level, score, tuple(reasons)))
    return sorted(evidence, key=lambda pair: (pair.level, pair.case_a, pair.case_b))


def issue_clusters(
    case_ids: Sequence[int], pairs: Sequence[PairEvidence], t_possible: float
) -> List[IssueCluster]:
    """Greedily merge only clusters whose every cross-pair meets the cutoff."""
    ids = sorted(set(case_ids))
    if not ids:
        return []
    scores = {(p.case_a, p.case_b): p.score for p in pairs}
    clusters: List[set[int]] = [{cid} for cid in ids]
    while True:
        merge = None
        for i, left in enumerate(clusters):
            for j in range(i + 1, len(clusters)):
                right = clusters[j]
                if all(scores.get((a, b) if a <= b else (b, a), -1.0) >= t_possible for a in left for b in right):
                    merge = i, j
                    break
            if merge:
                break
        if merge is None:
            break
        i, j = merge
        clusters[i] |= clusters[j]
        clusters.pop(j)
    clusters.sort(key=lambda c: min(c))
    return [IssueCluster(i + 1, "Related complaint cases", tuple(sorted(c))) for i, c in enumerate(clusters)]


def plan_group_updates(
    new: CaseLite,
    evidence: Sequence[PairEvidence],
    existing: Sequence[GroupLite],
    idx: MatchIndex,
    th: Thresholds,
) -> List[GroupPlan]:
    """Plan one isolated update per registry anchor; no pairwise transitive merging."""
    if not new.permanent_id or not evidence:
        return []
    grouped: Dict[Tuple[Level, str], List[PairEvidence]] = {}
    for pair in evidence:
        anchor = _anchor(new.permanent_id, pair.level, idx)
        if anchor:
            grouped.setdefault((pair.level, anchor), []).append(pair)

    plans: List[GroupPlan] = []
    for (level, anchor), pairs in sorted(grouped.items()):
        group = next((g for g in sorted(existing, key=lambda row: row.group_id)
                      if g.level == level and g.anchor_key == anchor and g.status in ("open", "confirmed", "dismissed")), None)
        action: GroupAction = "create" if group is None else ("reopen" if group.status == "dismissed" else "extend")
        pair_case_ids = {cid for pair in pairs for cid in (pair.case_a, pair.case_b)}
        case_ids = tuple(sorted(pair_case_ids if action == "reopen" or group is None
                                else pair_case_ids | set(group.case_ids)))
        tier: Tier = "probable" if any(
            pair.level == "institution" and _cross_bureau(pair, new, idx) and pair.score >= th.t_probable
            for pair in pairs
        ) else "possible"
        clusters = issue_clusters(tuple(pair_case_ids), pairs, th.t_possible)
        reasons = tuple(dict.fromkeys(reason for pair in pairs for reason in pair.reasons))
        plans.append(GroupPlan(
            action=action,
            level=level,
            anchor_key=anchor,
            tier=tier,
            case_ids=case_ids,
            pairs=tuple(sorted(pairs, key=lambda p: (p.case_a, p.case_b))),
            clusters=tuple(clusters),
            reasons=reasons,
            group_id=group.group_id if group else None,
        ))
    return plans


def _anchor(permanent_id: str, level: str, idx: MatchIndex) -> str:
    inst = idx.get_institution(permanent_id)
    if inst is None:
        return ""
    if level == "institution":
        return permanent_id
    if level == "parent":
        return f"parent:{inst.parent_id or inst.permanent_id}"
    return f"trust:{inst.trust_id}" if inst.trust_id is not None else ""


def _cross_bureau(pair: PairEvidence, new: CaseLite, idx: MatchIndex) -> bool:
    other_id = pair.case_a if pair.case_b == new.id else pair.case_b
    other = idx.case(other_id)
    return bool(other and other.bureau_id != new.bureau_id)


def _reasons(new: CaseLite, other: CaseLite, level: str, score: float, idx: MatchIndex) -> List[str]:
    if level == "institution":
        reasons = [f"Same institution {new.permanent_id}"]
    elif level == "parent":
        reasons = ["Institutions belong to the same parent university"]
    else:
        institution = idx.get_institution(new.permanent_id or "")
        trust_name = idx.trust_name(institution.trust_id) if institution and institution.trust_id else None
        reasons = [f"Both run by {trust_name}" if trust_name else "Institutions share a trust"]
    if new.bureau_id != other.bureau_id:
        reasons.append(f"Handled by {new.bureau_code} and {other.bureau_code}")
    if new.category_code == other.category_code:
        reasons.append(f"Both about {new.category_code.replace('_', ' ')}")
    reasons.append(f"Description similarity {idx.description_similarity(new.id, other.id):.2f}")
    reasons.append(f"Received {abs((new.received_at - other.received_at).days)} days apart")
    return reasons
