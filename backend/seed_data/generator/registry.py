"""The institution registry: trusts, universities with departments, standalone institutions."""

import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set

from . import vocab
from .noise import acronym, name_norm

INSTITUTION_TARGET = 500
TRUST_TARGET = 60
UNIVERSITY_TARGET = 15
TYPE_MIX = [("engineering", 45), ("management", 20), ("pharmacy", 12), ("polytechnic", 23)]
TRUST_SIZES = [1, 2, 2, 3, 3, 4, 5, 6]


@dataclass
class Registry:
    rng: random.Random
    trusts: List[dict]
    institutions: List[dict]
    used_names: Set[str] = field(default_factory=set)
    used_ids: Set[str] = field(default_factory=set)

    def __post_init__(self) -> None:
        self.used_names = {name_norm(i["name"]) for i in self.institutions}
        self.used_ids = {i["permanent_id"] for i in self.institutions}

    # ── locations ────────────────────────────────────────────────────────

    def place(self, state: Optional[str] = None, region: Optional[str] = None) -> Dict[str, str]:
        rng = self.rng
        if state is None:
            regions = sorted(vocab.GEOGRAPHY)
            region = region or rng.choices(regions, [vocab.REGION_WEIGHT[r] for r in regions])[0]
            state = rng.choice(sorted(vocab.GEOGRAPHY[region]))
        else:
            region = next(r for r, states in vocab.GEOGRAPHY.items() if state in states)
        return {"region": region, "state": state, "district": rng.choice(vocab.GEOGRAPHY[region][state])}

    # ── names ────────────────────────────────────────────────────────────

    def fresh_name(self, inst_type: str) -> str:
        while True:
            suffix = self.rng.choice(vocab.TYPE_SUFFIX[inst_type])
            name = f"{self.rng.choice(vocab.PLACE_WORDS)} {self.rng.choice(vocab.FOUNDER_WORDS)} {suffix}"
            if name_norm(name) not in self.used_names:
                return name

    def make_institution(
        self,
        inst_type: str,
        *,
        name: Optional[str] = None,
        where: Optional[Dict[str, str]] = None,
        trust_id: Optional[int] = None,
        parent: Optional[dict] = None,
    ) -> dict:
        rng = self.rng
        where = where or self.place()
        name = name or self.fresh_name(inst_type)
        while True:
            pid = f"1-4{rng.randrange(10**9):09d}"
            if pid not in self.used_ids:
                break
        self.used_ids.add(pid)
        self.used_names.add(name_norm(name))
        locality = vocab.LOCALITIES.get(where["district"], where["district"])
        acr = acronym(name) if parent is None else f"{parent['acronym']}-D{acronym(name.split('Department of ')[-1])}"
        row = {
            "permanent_id": pid,
            "name": name,
            "name_norm": name_norm(name),
            "acronym": acr,
            "address": f"{rng.randint(1, 250)}, {locality} Road, {where['district']}, {where['state']}",
            "district": where["district"],
            "state": where["state"],
            "pin": f"{rng.randint(1, 8)}{rng.randrange(10**5):05d}",
            "region": where["region"],
            "inst_type": inst_type,
            "year_est": rng.randint(1985, 2022),
            "trust_id": trust_id,
            "parent_id": parent["permanent_id"] if parent else None,
            "is_active": True,
        }
        self.institutions.append(row)
        return row

    def make_trust(self, state: str) -> dict:
        rng = self.rng
        while True:
            name = f"{rng.choice(vocab.PLACE_WORDS)} {rng.choice(vocab.FOUNDER_WORDS)} {rng.choice(vocab.TRUST_KINDS)}"
            if all(t["name"] != name for t in self.trusts):
                break
        trust = {
            "id": max(t["id"] for t in self.trusts) + 1,
            "name": name,
            "address": f"{rng.randint(1, 80)}, Civil Lines, {self.place(state)['district']}, {state}",
            "state": state,
        }
        self.trusts.append(trust)
        return trust

    # ── build ────────────────────────────────────────────────────────────

    def add_universities(self) -> None:
        rng = self.rng
        existing = sum(1 for i in self.institutions if i["inst_type"] == "university")
        for _ in range(UNIVERSITY_TARGET - existing):
            uni = self.make_institution("university")
            areas = rng.sample(vocab.DEPARTMENT_AREAS, rng.randint(2, 5))
            for area in areas:
                where = {k: uni[k] for k in ("region", "state", "district")}
                self.make_institution("university_department", name=f"{uni['name']} – Department of {area}", where=where, parent=uni)

    def add_trusts(self) -> None:
        rng = self.rng
        while len(self.trusts) < TRUST_TARGET:
            state = rng.choice(sorted(s for states in vocab.GEOGRAPHY.values() for s in states))
            trust = self.make_trust(state)
            for _ in range(rng.choice(TRUST_SIZES)):
                where = self.place(state)
                inst_type = rng.choices([t for t, _ in TYPE_MIX], [w for _, w in TYPE_MIX])[0]
                self.make_institution(inst_type, where=where, trust_id=trust["id"])

    def fill_independents(self, reserve_for_twins: int) -> None:
        types, weights = [t for t, _ in TYPE_MIX], [w for _, w in TYPE_MIX]
        while len(self.institutions) < INSTITUTION_TARGET - reserve_for_twins:
            self.make_institution(self.rng.choices(types, weights)[0])


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
