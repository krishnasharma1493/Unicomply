"""Institution-name resolution: exact identifiers, location constraints, then scored candidates."""

from __future__ import annotations

from typing import Dict, List, Optional, Sequence, Tuple

from rapidfuzz import fuzz
from rapidfuzz.distance import Levenshtein

from app.matching.index import MatchIndex
from app.matching.normalize import acronym_of, extract_district_hint, extract_permanent_id, normalize_name, tokens
from app.matching.types import Candidate, InstitutionLite, ResolutionResult, Thresholds


def resolve_institution(
    raw_text: str,
    raw_state: Optional[str],
    raw_district: Optional[str],
    idx: MatchIndex,
    th: Thresholds,
    top_k: int = 5,
) -> ResolutionResult:
    """Return ranked registry candidates and an auto/review/unresolved decision."""
    if top_k < 1:
        raise ValueError("top_k must be at least 1")
    permanent_id = extract_permanent_id(raw_text)
    if permanent_id:
        institution = idx.get_institution(permanent_id)
        if institution:
            return ResolutionResult("auto", (_candidate(institution, 1.0, ["Permanent ID found in the text"]),))
        return ResolutionResult("unresolved")

    abbreviations = _abbreviations()
    query = normalize_name(raw_text, abbreviations)
    exact_alias = idx.resolve_alias(query)
    if exact_alias:
        inst = idx.get_institution(exact_alias)
        if inst and _state_matches(inst, raw_state) and _district_matches(inst, raw_district, None):
            return ResolutionResult("auto", (_candidate(inst, 0.99, ["Spelling previously confirmed as an institution alias"]),))

    # Exact registered-name matches score 0.99, but duplicates remain ambiguous.
    pool = list(idx.candidates_in_state(raw_state))
    districts = {inst.district.upper(): inst.district.upper() for inst in pool}
    districts["JBP"] = "JABALPUR"
    district_hint = raw_district.strip().upper() if raw_district else extract_district_hint(raw_text, districts)
    if district_hint:
        pool = [inst for inst in pool if _district_matches(inst, district_hint, districts)]
    if not pool:
        return ResolutionResult("unresolved")

    exact = [inst for inst in pool if normalize_name(inst.name, abbreviations) == query]
    if exact:
        candidates = tuple(_candidate(inst, 0.99, ["Exact registered institution name"])
                           for inst in exact[:top_k])
        decision = "auto" if len(exact) == 1 else "pending_review"
        return ResolutionResult(decision, candidates)

    ids = [inst.permanent_id for inst in pool]
    district_tokens = set(tokens(district_hint or ""))
    name_query = " ".join(token for token in tokens(query) if token not in district_tokens)
    semantic = idx.name_similarity(" ".join(filter(None, [name_query, district_hint])), ids)
    query_tokens = set(tokens(query))
    scored: List[Tuple[float, InstitutionLite, Tuple[str, ...]]] = []
    weights = th.resolution
    for inst in pool:
        fuzzy_score = _fuzzy_score(name_query, inst.name_norm)
        semantic_score = float(semantic.get(inst.permanent_id, 0.0))
        acronym_score = 1.0 if (inst.acronym and inst.acronym.upper() in query_tokens) else 0.0
        prefix_typo = False
        name_tokens = tokens(inst.name_norm)
        query_words = tokens(name_query)
        if not acronym_score and name_tokens and query_words and len(query_words[0]) >= 4:
            prefix_typo = Levenshtein.distance(query_words[0], name_tokens[0]) == 1
            acronym_score = 1.0 if prefix_typo else 0.0
        location_score = _location_score(inst, raw_state, district_hint)
        score = min(1.0, max(0.0,
            weights.fuzzy * fuzzy_score + weights.semantic * semantic_score
            + weights.acronym * acronym_score + weights.location * location_score
        ))
        reasons = [f"Name {round(fuzzy_score * 100)}% similar"]
        if acronym_score:
            if prefix_typo:
                reasons.append(f"Leading name token {query_words[0]} has a one-character typo of {name_tokens[0]}")
            else:
                reasons.append(f"Acronym {inst.acronym} matches")
        if district_hint:
            reasons.append(f"District {inst.district} matches")
        if raw_state:
            reasons.append(f"State {inst.state} matches")
        else:
            reasons.append("State not supplied; compared across the registry")
        if semantic_score > 0:
            reasons.append(f"Description/name context similarity {semantic_score:.2f}")
        scored.append((score, inst, tuple(reasons)))

    scored.sort(key=lambda row: (-row[0], row[1].permanent_id))
    best = scored[:top_k]
    candidates = tuple(_candidate(inst, score, reasons) for score, inst, reasons in best)
    top = scored[0][0]
    runner_up = scored[1][0] if len(scored) > 1 else 0.0
    margin_ok = top - runner_up >= th.margin
    if top >= th.t_auto and margin_ok:
        decision = "auto"
    elif top >= th.t_review:
        decision = "pending_review"
    else:
        decision = "unresolved"
    return ResolutionResult(decision, candidates)


def _candidate(inst: InstitutionLite, score: float, reasons: Sequence[str]) -> Candidate:
    return Candidate(inst.permanent_id, inst.name, inst.district, inst.state, score, tuple(reasons))


def _fuzzy_score(query: str, name: str) -> float:
    if not query or not name:
        return 0.0
    query_tokens, name_tokens = tokens(query), tokens(name)
    leading_name = fuzz.ratio(query_tokens[0], name_tokens[0]) / 100.0 if query_tokens and name_tokens else 0.0
    return max(fuzz.token_set_ratio(query, name), fuzz.partial_ratio(query, name), leading_name * 100.0) / 100.0


def _state_matches(inst: InstitutionLite, state: Optional[str]) -> bool:
    return not state or inst.state.casefold() == state.strip().casefold()


def _district_matches(inst: InstitutionLite, district: Optional[str], aliases: Optional[Dict[str, str]]) -> bool:
    if not district:
        return True
    canonical = (aliases or {}).get(district.upper(), district.upper())
    return inst.district.casefold() == canonical.casefold()


def _location_score(inst: InstitutionLite, state: Optional[str], district: Optional[str]) -> float:
    if district and inst.district.casefold() == district.casefold():
        return 1.0
    if state and inst.state.casefold() == state.strip().casefold():
        return 0.8
    return 0.5


def _abbreviations() -> Dict[str, str]:
    from app.matching.normalize import load_abbreviations

    return dict(load_abbreviations())
