"""In-memory registry, alias and case-vector index used by the pure matching package."""

from __future__ import annotations

import hashlib
import json
import os
import pickle
from dataclasses import asdict
from datetime import date, timedelta
from pathlib import Path
from typing import Dict, Iterable, Mapping, Optional, Sequence, Set, Tuple

import numpy as np

from app.matching.embed import Embedder
from app.matching.types import AliasLite, CaseLite, InstitutionLite, Level


def _ordered(a: int, b: int) -> Tuple[int, int]:
    return (a, b) if a <= b else (b, a)


class MatchIndex:
    """A deterministic snapshot of the registry and known cases."""

    def __init__(
        self,
        institutions: Sequence[InstitutionLite],
        aliases: Sequence[AliasLite],
        cases: Sequence[CaseLite],
        dismissed_pairs: Iterable[Tuple[int, int]],
        embedder: Embedder,
        trust_names: Optional[Mapping[int, str]] = None,
        name_vectors: Optional[np.ndarray] = None,
        case_vectors: Optional[np.ndarray] = None,
    ) -> None:
        self.institutions = {row.permanent_id: row for row in institutions}
        self.aliases: Dict[str, str] = {a.alias_norm: a.permanent_id for a in aliases}
        self.cases = {case.id: case for case in cases}
        self.dismissed: Set[Tuple[int, int]] = {_ordered(a, b) for a, b in dismissed_pairs}
        self.embedder = embedder
        self.trust_names = dict(trust_names or {})
        self._ids = list(self.institutions)
        self.name_vectors = name_vectors if name_vectors is not None else np.zeros((0, 0), dtype=np.float32)
        self._case_ids = list(self.cases)
        self.case_vectors = case_vectors if case_vectors is not None else np.zeros((0, 0), dtype=np.float32)
        self._name_positions = {pid: i for i, pid in enumerate(self._ids)}
        self._case_positions = {cid: i for i, cid in enumerate(self._case_ids)}

    def candidates_in_state(self, state: Optional[str]) -> Sequence[InstitutionLite]:
        rows = list(self.institutions.values())
        if not state:
            return rows
        return [row for row in rows if row.state.casefold() == state.strip().casefold()]

    def get_institution(self, permanent_id: str) -> Optional[InstitutionLite]:
        return self.institutions.get(permanent_id)

    def resolve_alias(self, alias_norm: str) -> Optional[str]:
        return self.aliases.get(alias_norm)

    def trust_name(self, trust_id: int) -> Optional[str]:
        return self.trust_names.get(trust_id)

    def name_similarity(self, query_norm: str, permanent_ids: Sequence[str]) -> Mapping[str, float]:
        ids = [pid for pid in permanent_ids if pid in self._name_positions]
        if not ids:
            return {}
        query = self.embedder.encode([query_norm])[0]
        return {pid: float(np.clip(np.dot(query, self.name_vectors[self._name_positions[pid]]), 0.0, 1.0)) for pid in ids}

    def description_similarity(self, case_a: int, case_b: int) -> float:
        left, right = self._case_positions.get(case_a), self._case_positions.get(case_b)
        if left is None or right is None:
            return 0.0
        return float(np.clip(np.dot(self.case_vectors[left], self.case_vectors[right]), 0.0, 1.0))

    def level_between(self, pid_a: str, pid_b: str) -> Optional[Level]:
        a, b = self.institutions.get(pid_a), self.institutions.get(pid_b)
        if a is None or b is None:
            return None
        if pid_a == pid_b:
            return "institution"
        a_parent, b_parent = a.parent_id or a.permanent_id, b.parent_id or b.permanent_id
        if a_parent == b_parent and (a.parent_id is not None or b.parent_id is not None):
            return "parent"
        if a.trust_id is not None and a.trust_id == b.trust_id:
            return "trust"
        return None

    def related_cases(self, permanent_id: str, window_days: int, today: date) -> Sequence[CaseLite]:
        inst = self.institutions.get(permanent_id)
        if inst is None:
            return []
        family = {pid for pid in self.institutions if self.level_between(permanent_id, pid) is not None}
        cutoff = today - timedelta(days=window_days)
        return [
            case for case in self.cases.values()
            if case.permanent_id in family and (case.is_open or (case.disposed_at is not None and case.disposed_at >= cutoff))
        ]

    def is_dismissed(self, case_a: int, case_b: int) -> bool:
        return _ordered(case_a, case_b) in self.dismissed

    def case(self, case_id: int) -> Optional[CaseLite]:
        return self.cases.get(case_id)

    def add_alias(self, alias_norm: str, permanent_id: str) -> None:
        if permanent_id not in self.institutions:
            raise KeyError(f"Unknown Permanent ID {permanent_id}")
        self.aliases[alias_norm] = permanent_id

    def upsert_case(self, case: CaseLite) -> None:
        old_ids = self._case_ids
        self.cases[case.id] = case
        self._case_ids = list(self.cases)
        self._case_positions = {cid: i for i, cid in enumerate(self._case_ids)}
        vector = self.embedder.encode([case.description])
        if case.id in old_ids:
            rows = [self.case_vectors[self._case_positions[cid]] if cid != case.id else vector[0] for cid in self._case_ids]
            self.case_vectors = np.asarray(rows, dtype=np.float32)
        else:
            self.case_vectors = np.vstack([self.case_vectors, vector]) if self.case_vectors.size else vector


def build_index(
    institutions: Iterable[InstitutionLite],
    aliases: Iterable[AliasLite],
    cases: Iterable[CaseLite],
    dismissed_pairs: Iterable[Tuple[int, int]],
    embedder: Embedder,
    trust_names: Optional[Mapping[int, str]] = None,
) -> MatchIndex:
    institutions, aliases, cases = list(institutions), list(aliases), list(cases)
    dismissed_pairs = list(dismissed_pairs)
    corpus_hash = hashlib.sha256(json.dumps({
        "institutions": [asdict(x) for x in institutions],
        "aliases": [asdict(x) for x in aliases],
        "cases": [asdict(x) for x in cases],
        "dismissed": sorted(_ordered(a, b) for a, b in dismissed_pairs),
        "trust_names": dict(trust_names or {}),
        "embedder": getattr(embedder, "model_name", embedder.mode),
    }, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()
    cache = Path(__file__).resolve().parents[2] / "seed_data" / ".cache" / f"match-index-{embedder.mode}-{corpus_hash}.pkl"
    if cache.exists():
        try:
            with cache.open("rb") as handle:
                saved_hash, index = pickle.load(handle)
            if saved_hash == corpus_hash and isinstance(index, MatchIndex):
                return index
        except (OSError, EOFError, pickle.PickleError, ValueError, AttributeError):
            pass

    name_texts = [f"{x.name} {x.district} {x.state}" for x in institutions]
    case_texts = [x.description for x in cases]
    embedder.fit([*name_texts, *case_texts])
    names = embedder.encode(name_texts)
    case_vectors = embedder.encode(case_texts)
    index = MatchIndex(institutions, aliases, cases, dismissed_pairs, embedder, trust_names, names, case_vectors)
    try:
        cache.parent.mkdir(parents=True, exist_ok=True)
        temp = cache.with_suffix(cache.suffix + f".{os.getpid()}.tmp")
        with temp.open("wb") as handle:
            pickle.dump((corpus_hash, index), handle, protocol=pickle.HIGHEST_PROTOCOL)
        temp.replace(cache)
    except OSError:
        pass  # A read-only install can still use the in-memory index.
    return index
