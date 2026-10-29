"""The institution registry: real AICTE-approved institutions (aicte_registry.json) around the hand-written hero institutions."""

import json
import random
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from . import vocab

INSTITUTION_TARGET = 500  # institutions that get cases; the rest of the registry is what the matcher has to search through
CORE_TYPES = ("engineering", "management", "pharmacy", "polytechnic", "hotel_management")
REGISTRY_FILE = Path(__file__).resolve().parents[1] / "aicte_registry.json"


def load_registry(path: Path = REGISTRY_FILE) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))  # type: ignore[no-any-return]


@dataclass
class Registry:
    rng: random.Random
    trusts: List[dict]
    institutions: List[dict]
    real: dict
    active: List[dict] = field(default_factory=list)
    twin_pairs: List[Tuple[dict, dict]] = field(default_factory=list)
    unknown_pool: List[Tuple[str, str, str]] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.tiny_pids = {i["permanent_id"] for i in self.institutions}
        self.merge()
        self.unknown_pool = self.rng.sample(vocab.UNKNOWN_INSTITUTIONS, len(vocab.UNKNOWN_INSTITUTIONS))

    # ── the registry ─────────────────────────────────────────────────────

    def merge(self) -> None:
        """Add every real institution the hero world does not already hold; a trust the hero world has keeps its id."""
        known = {t["name"]: t["id"] for t in self.trusts}
        remap: Dict[int, int] = {}
        for trust in self.real["trusts"]:
            if trust["name"] not in known:
                known[trust["name"]] = max([t["id"] for t in self.trusts] + [0]) + 1
                self.trusts.append({**trust, "id": known[trust["name"]]})
            remap[trust["id"]] = known[trust["name"]]
        for row in self.real["institutions"]:
            if row["permanent_id"] not in self.tiny_pids:
                self.institutions.append({**row, "trust_id": remap.get(row["trust_id"])})

    def pick_active(self) -> None:
        """Choose the institutions that get cases: the hero ones, whole trust and university families, twins, then independents."""
        by_pid = {i["permanent_id"]: i for i in self.institutions}
        names: Dict[str, int] = {}
        for i in self.institutions:
            names[i["name_norm"]] = names.get(i["name_norm"], 0) + 1
        chosen: Dict[str, dict] = {pid: by_pid[pid] for pid in self.tiny_pids}
        parents = {i["parent_id"] for i in self.institutions if i["parent_id"]}
        for i in self.institutions:
            if i["trust_id"] is not None or i["parent_id"] or i["permanent_id"] in parents:
                chosen[i["permanent_id"]] = i
        plain = lambda i: i["trust_id"] is None and i["parent_id"] is None and i["permanent_id"] not in self.tiny_pids  # noqa: E731
        pairs = [(by_pid[a], by_pid[b]) for a, b in self.real["twin_pairs"] if a in by_pid and b in by_pid]
        pairs = [(a, b) for a, b in pairs if plain(a) and plain(b)]
        self.twin_pairs = self.rng.sample(pairs, len(pairs))
        for a, b in self.twin_pairs:
            chosen[a["permanent_id"]] = a
            chosen[b["permanent_id"]] = b
        independents = [i for i in self.institutions if plain(i) and i["inst_type"] in CORE_TYPES and names[i["name_norm"]] == 1
                        and i["permanent_id"] not in chosen]
        self.rng.shuffle(independents)
        for i in independents:
            if len(chosen) >= INSTITUTION_TARGET:
                break
            chosen[i["permanent_id"]] = i
        self.active = [i for i in self.institutions if i["permanent_id"] in chosen]

    # ── what the matcher cannot find ─────────────────────────────────────

    def unknown_institution(self) -> Tuple[str, Dict[str, str]]:
        """A real institution that is not AICTE-approved (an IIT, IIM or IHM): the complaint cannot be linked to the registry."""
        name, state, district = self.unknown_pool.pop()
        return name, {"state": state, "district": district}

    # ── near names ───────────────────────────────────────────────────────

    def lookalikes(self, inst: dict, k: int, taken: Optional[Set[str]] = None) -> List[dict]:
        """The k registry institutions in the same state whose names are closest to `inst`'s (the review candidates a matcher would offer)."""
        scored = sorted(
            (-SequenceMatcher(None, inst["name_norm"], o["name_norm"]).ratio(), o["permanent_id"])
            for o in self.institutions
            if o["state"] == inst["state"] and o["permanent_id"] != inst["permanent_id"] and o["permanent_id"] not in (taken or set())
        )
        by_pid = {i["permanent_id"]: i for i in self.institutions}
        return [by_pid[pid] for _, pid in scored[:k]]


class Families:
    """Institutions that count as one overlap family: same trust, or a university and its departments."""

    def __init__(self, institutions: List[dict]) -> None:
        self.parent: Dict[str, str] = {i["permanent_id"]: i["permanent_id"] for i in institutions}
        by_trust: Dict[int, str] = {}
        for i in institutions:
            if i["parent_id"]:
                self.union(i["permanent_id"], i["parent_id"])
            if i["trust_id"] is not None:
                first = by_trust.setdefault(i["trust_id"], i["permanent_id"])
                self.union(i["permanent_id"], first)

    def root(self, pid: str) -> str:
        while self.parent[pid] != pid:
            self.parent[pid] = self.parent[self.parent[pid]]
            pid = self.parent[pid]
        return pid

    def union(self, a: str, b: str) -> None:
        self.parent[self.root(a)] = self.root(b)
