"""Assemble the full synthetic world around the hand-written hero story (the tiny seed)."""

import copy
import json
import random
import re
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from . import vocab
from .cases import AS_OF, CATEGORY_WEIGHT, CHANNELS, OPEN_PATHS, Spec, Staff, _ts, case_row
from . import noise
from .noise import inverse_abbreviations
from .registry import Families, Registry, load_registry

CASE_TARGET = 1500
PLANTED = {"institution": 30, "parent": 5, "trust": 10}
HARD_NEGATIVES = {"same_name_other_state": 10, "disposed_long_ago": 10}
REVIEWS = {"pending": 16, "reviewed": 8, "unresolved": 4}
PROVIDED_SHARE = 0.05
HORIZON = 270
FILES = ("bureaus", "categories", "users", "institutions", "cases", "reviews", "overlaps", "alerts")
LOCATION_TAGS = ("district_missing", "city_for_district", "wrong_state")
SELF_CHECKED = ("RB", "PGRC", "AB", "ACAD")
CORE_TYPES = ("engineering", "management", "pharmacy", "polytechnic", "hotel_management")


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))  # type: ignore[no-any-return]


class World:
    def __init__(self, seed: int, base: Path, abbreviations: Path) -> None:
        self.seed = seed
        self.rng = random.Random(seed)
        self.base = {name: read(base / f"{name}.json") for name in FILES}
        self.inverse = inverse_abbreviations(read(abbreviations)["abbreviations"])
        self.bureaus = self.base["bureaus"]["bureaus"]
        self.categories = {c["code"]: c for c in self.base["categories"]["categories"]}
        self.category_ids = {code: c["id"] for code, c in self.categories.items()}
        self.bureau_by_code = {b["code"]: b["id"] for b in self.bureaus}
        self.ro_of_region = {b["region"]: b["id"] for b in self.bureaus if b["kind"] == "regional_office"}
        self.all_bureaus = [b["id"] for b in self.bureaus]
        self.users = copy.deepcopy(self.base["users"]["users"])
        self.add_case_officers()
        self.staff = Staff(self.users, self.ro_of_region)
        self.tiny_cases = self.base["cases"]["cases"]
        self.states = sorted(s for states in vocab.GEOGRAPHY.values() for s in states)

    # ── people ───────────────────────────────────────────────────────────

    def add_case_officers(self) -> None:
        """Every bureau gets a case officer (data only: they are assigned cases, they never log in)."""
        have = {u["bureau_id"] for u in self.users if u["role"] == "case_officer"}
        emails = {u["email"] for u in self.users}
        for b in self.bureaus:
            if b["id"] in have:
                continue
            while True:
                first, last = self.rng.choice(vocab.FIRST_NAMES), self.rng.choice(vocab.LAST_NAMES)
                email = f"{first.lower()}.{last.lower()}@aicte.example"
                if email not in emails:
                    break
            emails.add(email)
            self.users.append({"id": max(u["id"] for u in self.users) + 1, "email": email, "name": f"{first} {last}",
                               "role": "case_officer", "bureau_id": b["id"], "region": b["region"], "is_admin": False})

    # ── registry ─────────────────────────────────────────────────────────

    def build_registry(self) -> None:
        inst = self.base["institutions"]
        self.tiny_pids = {i["permanent_id"] for i in inst["institutions"]}
        self.registry = Registry(self.rng, copy.deepcopy(inst["trusts"]), copy.deepcopy(inst["institutions"]), load_registry())
        reg = self.registry
        reg.pick_active()
        tiny_trusts = {t["id"] for t in inst["trusts"]}
        twin_count = HARD_NEGATIVES["same_name_other_state"]
        assert len(reg.twin_pairs) >= twin_count, "the registry has too few same-name institutions in two states"
        pairs = reg.twin_pairs[:twin_count]
        self.twin_sources, self.twins = [a for a, _ in pairs], [b for _, b in pairs]
        in_pairs = {i["permanent_id"] for pair in reg.twin_pairs for i in pair}

        independents = [i for i in reg.active
                        if i["trust_id"] is None and i["parent_id"] is None and i["inst_type"] in CORE_TYPES
                        and i["permanent_id"] not in self.tiny_pids and i["permanent_id"] not in in_pairs]
        self.rng.shuffle(independents)
        n_inst, n_old = PLANTED["institution"], HARD_NEGATIVES["disposed_long_ago"]
        self.planted_institutions = independents[:n_inst]
        self.old_negatives = independents[n_inst:n_inst + n_old]

        members: Dict[int, List[dict]] = {}
        for i in reg.active:
            if i["trust_id"] is not None and i["trust_id"] not in tiny_trusts:
                members.setdefault(i["trust_id"], []).append(i)
        trust_ids = sorted(t for t, m in members.items() if len({i["name_norm"] for i in m}) >= 2)
        self.planted_trusts = self.rng.sample(trust_ids, PLANTED["trust"])
        self.planted_trust_members = {t: members[t] for t in self.planted_trusts}
        with_departments = {i["parent_id"] for i in reg.institutions if i["parent_id"]}
        universities = [i for i in reg.active if i["inst_type"] == "university" and i["permanent_id"] in with_departments
                        and i["permanent_id"] not in self.tiny_pids]
        self.planted_universities = self.rng.sample(universities, PLANTED["parent"])

        reserved = set(self.tiny_pids)
        for group in (self.planted_institutions, self.old_negatives, self.twin_sources, self.twins):
            reserved.update(i["permanent_id"] for i in group)
        for m in self.planted_trust_members.values():
            reserved.update(i["permanent_id"] for i in m)
        for uni in self.planted_universities:
            reserved.add(uni["permanent_id"])
            reserved.update(i["permanent_id"] for i in reg.institutions if i["parent_id"] == uni["permanent_id"])
        self.families = Families(reg.institutions)
        reserved_roots = {self.families.root(p) for p in reserved}
        self.background = [i for i in reg.active if self.families.root(i["permanent_id"]) not in reserved_roots]
        self.by_pid = {i["permanent_id"]: i for i in reg.institutions}

    # ── specs ────────────────────────────────────────────────────────────

    def category(self) -> str:
        codes = list(CATEGORY_WEIGHT)
        return self.rng.choices(codes, [CATEGORY_WEIGHT[c] for c in codes])[0]

    def channel_for(self, bureau_id: int) -> str:
        rng = self.rng
        if bureau_id in self.ro_of_region.values():
            return "ro_referral"
        if bureau_id == self.bureau_by_code["RB"]:
            return rng.choice(["rb_suo_motu", "inspection", "email"])
        if bureau_id == self.bureau_by_code["PGRC"]:
            return rng.choice(["cpgrams", "cpgrams", "aicte_portal", "email"])
        return rng.choice(["aicte_portal", "email"])

    def cross_bureaus(self, n: int, institution: dict) -> List[int]:
        options = [self.bureau_by_code[c] for c in SELF_CHECKED] + [self.ro_of_region[institution["region"]]]
        return self.rng.sample(options, n)

    def received_run(self, n: int, spread: int) -> List[date]:
        rng = self.rng
        first = AS_OF - timedelta(days=rng.randint(20, 120))
        days = [first]
        for _ in range(n - 1):
            days.append(min(days[-1] + timedelta(days=rng.randint(1, spread)), AS_OF - timedelta(days=2)))
        return days

    def plant(self, level: str, anchor: str, insts: List[dict], n: int, spread: int) -> None:
        rng = self.rng
        category, core, ask = self.category(), rng.randrange(4), rng.randrange(5)
        if category == "other":
            category = "certificate_withheld"
        bureaus = self.cross_bureaus(n, insts[0])
        for b, day, inst in zip(bureaus, self.received_run(n, spread), (insts * n)[:n]):
            self.specs.append(Spec(inst["permanent_id"], b, category, self.channel_for(b), day, core=core, ask=ask, group=f"{level}|{anchor}"))

    def plan_planted(self) -> None:
        rng = self.rng
        for inst in self.planted_institutions:
            self.plant("institution", inst["permanent_id"], [inst], rng.choice([2, 2, 3]), spread=14)
        for uni in self.planted_universities:
            kids = [i for i in self.registry.institutions if i["parent_id"] == uni["permanent_id"]]
            self.plant("parent", f"parent:{uni['permanent_id']}", rng.sample([uni] + kids, 2), 2, spread=6)
        for trust_id in self.planted_trusts:
            self.plant("trust", f"trust:{trust_id}", rng.sample(self.planted_trust_members[trust_id], 2), 2, spread=6)

    def plan_hard_negatives(self) -> None:
        rng = self.rng
        pairs = list(zip(self.twin_sources, self.twins))
        for n, (a, b) in enumerate(pairs):
            category, core, ask = self.category(), rng.randrange(4), rng.randrange(5)
            b1, b2 = rng.sample([self.bureau_by_code[c] for c in SELF_CHECKED], 2)
            day = AS_OF - timedelta(days=rng.randint(10, 100))
            for inst, bureau, when in ((a, b1, day), (b, b2, min(day + timedelta(days=rng.randint(0, 10)), AS_OF - timedelta(days=2)))):
                self.specs.append(Spec(inst["permanent_id"], bureau, category, self.channel_for(bureau), when, core=core, ask=ask,
                                       clean_location=True, group=f"same_name_other_state|{n}"))
        for n, inst in enumerate(self.old_negatives):
            category, core, ask = self.category(), rng.randrange(4), rng.randrange(5)
            b1, b2 = rng.sample([self.bureau_by_code[c] for c in SELF_CHECKED], 2)
            self.specs.append(Spec(inst["permanent_id"], b1, category, self.channel_for(b1), AS_OF - timedelta(days=rng.randint(255, HORIZON)),
                                   path="disposed", core=core, ask=ask, group=f"disposed_long_ago|{n}"))
            self.specs.append(Spec(inst["permanent_id"], b2, category, self.channel_for(b2), AS_OF - timedelta(days=rng.randint(3, 25)),
                                   core=core, ask=ask, group=f"disposed_long_ago|{n}"))

    def channel_quota(self, want: int) -> List[str]:
        """Background channels that bring the whole data set to the PRD mix (planted cases already took theirs)."""
        total = sum(w for _, w in CHANNELS)
        taken = Counter(s.channel for s in self.specs) + Counter(c["source_channel"] for c in self.tiny_cases)
        quota = {ch: max(0, round(CASE_TARGET * w / total) - taken[ch]) for ch, w in CHANNELS}
        while sum(quota.values()) != want:  # rounding and over-full channels: settle the difference on the biggest
            biggest = max(quota, key=lambda ch: quota[ch])
            quota[biggest] += 1 if sum(quota.values()) < want else -1
        out = [ch for ch, n in quota.items() for _ in range(n)]
        self.rng.shuffle(out)
        return out

    def plan_background(self) -> None:
        rng = self.rng
        want = CASE_TARGET - len(self.tiny_cases) - len(self.specs)
        kinds = (["pending"] * REVIEWS["pending"] + ["reviewed"] * REVIEWS["reviewed"] + ["unresolved"] * REVIEWS["unresolved"]
                 + ["provided"] * round(want * PROVIDED_SHARE))
        kinds += ["auto"] * (want - len(kinds))
        rng.shuffle(kinds)
        family_bureau: Dict[str, int] = {}
        used: Dict[Tuple[str, str], List[int]] = {}
        channels = self.channel_quota(want)
        for kind, channel in zip(kinds, channels):
            day = AS_OF - timedelta(days=rng.randint(2, HORIZON))
            if kind == "unresolved":
                unknown_name, where = self.registry.unknown_institution()
                category = self.category()
                bureau = self.bureau_by_code[self.categories[category]["default_bureau_code"]]
                self.specs.append(Spec(None, bureau, category, channel, day, resolution=kind, paths=tuple(OPEN_PATHS) + ("disposed",),
                                       unknown_name=unknown_name, unknown_where=where))
                continue
            category = "faculty_shortage" if channel in ("rb_suo_motu", "inspection") and rng.random() < 0.5 else self.category()
            if channel in ("rb_suo_motu", "inspection") and category not in ("faculty_shortage", "infrastructure_deficiency", "admission_irregularity", "unapproved_course"):
                category = rng.choice(["infrastructure_deficiency", "admission_irregularity", "unapproved_course"])
            bureau_of = lambda inst: (  # noqa: E731
                self.ro_of_region[inst["region"]] if channel == "ro_referral"
                else self.bureau_by_code["RB"] if channel in ("rb_suo_motu", "inspection") and self.categories[category]["default_bureau_code"] != "AB"
                else self.bureau_by_code[self.categories[category]["default_bureau_code"]])
            compatible = lambda inst: family_bureau.get(self.families.root(inst["permanent_id"]), bureau_of(inst)) == bureau_of(inst)  # noqa: E731
            chosen = None
            for fresh_only in (True, False):  # first a (institution, category) nobody has used, then a repeat
                for _ in range(120):
                    inst = rng.choice(self.background)
                    if compatible(inst) and not (fresh_only and (inst["permanent_id"], category) in used):
                        chosen = inst
                        break
                if chosen:
                    break
            if chosen is None:  # last resort: an institution in a family nobody has used yet
                chosen = rng.choice([i for i in self.background if self.families.root(i["permanent_id"]) not in family_bureau])
            inst, bureau = chosen, bureau_of(chosen)
            family_bureau[self.families.root(inst["permanent_id"])] = bureau
            earlier = used.get((inst["permanent_id"], category), [])
            core = rng.choice([c for c in range(4) if c not in earlier] or list(range(4)))  # a repeat is a different matter
            used.setdefault((inst["permanent_id"], category), []).append(core)
            self.specs.append(Spec(inst["permanent_id"], bureau, category, channel, day, resolution=kind, core=core,
                                   paths=tuple(OPEN_PATHS) + ("disposed", "disposed_interim", "reopened")))

    # ── materialise ──────────────────────────────────────────────────────

    def materialise(self) -> None:
        rng = self.rng
        counts = Counter(self.families.root(s.pid) for s in self.specs if s.pid)
        for s in self.specs:
            if not s.group and s.pid and counts[self.families.root(s.pid)] == 1:
                s.can_transfer = True
                s.paths = s.paths + ("transferred", "transferred_assigned")
        order = sorted(range(len(self.specs)), key=lambda n: (self.specs[n].received, n))
        used_refs = {c["case_ref"] for c in self.tiny_cases}
        code_of = {b["id"]: b["code"] for b in self.bureaus}
        seq: Dict[str, int] = Counter()

        def next_ref(bureau_id: int) -> str:
            code = code_of[bureau_id]
            while True:
                seq[code] += 1
                ref = f"{code}/2026/{seq[code]:05d}"
                if ref not in used_refs:
                    used_refs.add(ref)
                    return ref

        self.rows: List[dict] = []
        self.tags: Dict[int, List[str]] = {}
        self.truth: Dict[int, Optional[str]] = {}
        self.group_cases: Dict[str, List[int]] = {}
        district_noise, wrong_state = self.location_noise(order)
        cid, aid = 201, 2001
        for n in order:
            spec = self.specs[n]
            inst = self.by_pid.get(spec.pid) if spec.pid else None
            row, tags = case_row(rng, spec, cid, next_ref(spec.bureau_id), aid, inst, self.staff, self.categories,
                                 self.category_ids, self.all_bureaus, self.inverse, self.states,
                                 district_noise.get(n, "none"), n in wrong_state)
            self.rows.append(row)
            self.tags[cid] = tags
            self.truth[cid] = spec.pid
            if spec.group:
                self.group_cases.setdefault(spec.group, []).append(cid)
            cid += 1
            aid += len(row["actions"])

    def location_noise(self, order: List[int]) -> Tuple[Dict[int, str], Set[int]]:
        """Exact-quota location noise (PRD §4.7 rates), spread at random over the cases that are not deliberately clean."""
        rng = self.rng
        eligible = [n for n in order if not self.specs[n].clean_location]
        total = len(eligible)
        district_of = lambda n: self.by_pid[self.specs[n].pid]["district"] if self.specs[n].pid else self.specs[n].unknown_where["district"]  # type: ignore[index] # noqa: E731
        city = set(rng.sample([n for n in eligible if district_of(n) in vocab.LOCALITIES], round(total * noise.P_CITY_FOR_DISTRICT)))
        rest = [n for n in eligible if n not in city]
        missing = set(rng.sample(rest, round(total * noise.P_DISTRICT_MISSING)))
        kinds = {n: "city" if n in city else "missing" if n in missing else "none" for n in eligible}
        wrong = set(rng.sample(eligible, round(total * noise.P_WRONG_STATE)))
        return kinds, wrong

    # ── reviews ──────────────────────────────────────────────────────────

    def build_reviews(self) -> List[dict]:
        rng = self.rng
        reviews, rid = [], max(r["id"] for r in self.base["reviews"]["reviews"]) + 1
        for row in self.rows:
            if row["match_status"] not in ("pending_review", "unresolved", "reviewed"):
                continue
            truth = self.truth[row["id"]]
            candidates: List[dict] = []
            if truth:
                picks = [self.by_pid[truth]] + self.registry.lookalikes(self.by_pid[truth], 2)
                top = row["match_score"]
                for rank, inst in enumerate(picks):
                    score = top if rank == 0 else round(max(0.2, top - rng.uniform(0.05, 0.2)), 2)
                    candidates.append({"permanent_id": inst["permanent_id"], "name": inst["name"], "district": inst["district"], "state": inst["state"],
                                       "score": score, "reasons": [f"Name {int(score * 100)}% similar", f"State {inst['state']} matches"]})
            created = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00")) + timedelta(hours=1)
            resolved = row["match_status"] == "reviewed"
            reviews.append({
                "id": rid, "case_id": row["id"], "candidates": candidates, "status": "resolved" if resolved else "pending",
                "decided_permanent_id": truth if resolved else None, "decided_by": 5 if resolved else None,
                "decided_at": _ts((created + timedelta(days=1)).replace(tzinfo=None)) if resolved else None,
                "created_at": _ts(created.replace(tzinfo=None)),
            })
            rid += 1
        return reviews

    # ── overlap groups ───────────────────────────────────────────────────

    def build_overlaps(self) -> Tuple[List[dict], List[dict], List[dict]]:
        rng = self.rng
        base = self.base["overlaps"]
        groups, pairs = copy.deepcopy(base["groups"]), copy.deepcopy(base["pairs"])
        gid, pid_ = max(g["id"] for g in groups) + 1, max(p["id"] for p in pairs) + 1
        rows = {r["id"]: r for r in self.rows}
        code_of = {b["id"]: b["code"] for b in self.bureaus}
        category_name = {c["id"]: c["name"].lower() for c in self.categories.values()}
        clusters: List[dict] = []
        planted = [(g, ids) for g, ids in sorted(self.group_cases.items()) if g.split("|")[0] in PLANTED]
        officers = {b: ids for b, ids in self.staff.officers.items()}
        for n, (label, ids) in enumerate(planted):
            level, anchor = label.split("|")
            members = [rows[i] for i in ids]
            day = max(datetime.fromisoformat(m["created_at"].replace("Z", "+00:00")) for m in members).replace(tzinfo=None)
            status = "confirmed" if n % 9 == 4 else "dismissed" if n % 11 == 3 else "open"
            tier = "probable" if level == "institution" else "possible"
            group = {"id": gid, "level": level, "anchor_key": anchor, "tier": tier, "status": status, "coordinator_id": None, "decided_by": None,
                     "decided_at": None, "decision_remark": None, "created_at": _ts(day + timedelta(hours=2)),
                     "updated_at": _ts(day + timedelta(hours=2)), "links": [{"case_id": i, "added_at": _ts(day + timedelta(hours=2))} for i in ids]}
            if status == "confirmed":
                group.update(coordinator_id=officers[members[0]["current_bureau_id"]][0], decided_by=1,
                             decided_at=_ts(day + timedelta(days=1)), updated_at=_ts(day + timedelta(days=1)))
            elif status == "dismissed":
                group.update(decided_by=1, decided_at=_ts(day + timedelta(days=1)), updated_at=_ts(day + timedelta(days=1)),
                             decision_remark="Different matters; no coordination needed.")
            groups.append(group)
            for a in range(len(ids)):
                for b in range(a + 1, len(ids)):
                    ra, rb = members[a], members[b]
                    low, high = {"institution": (0.70, 0.93), "parent": (0.60, 0.78), "trust": (0.47, 0.58)}[level]
                    same_cat = ra["category_id"] == rb["category_id"]
                    reasons = [f"Same institution {ra['permanent_id']}" if level == "institution" else
                               "Institutions belong to the same parent university" if level == "parent" else "Both run by the same trust"]
                    reasons.append(f"Handled by {code_of[ra['current_bureau_id']]} and {code_of[rb['current_bureau_id']]}")
                    if same_cat:
                        reasons.append(f"Both about {category_name[ra['category_id']]}")
                    score = round(rng.uniform(low, high), 2)
                    reasons.append(f"Description similarity {rng.uniform(0.6, 0.95):.2f}")
                    reasons.append(f"Received {abs((date.fromisoformat(ra['received_at']) - date.fromisoformat(rb['received_at'])).days)} days apart")
                    pairs.append({"id": pid_, "case_a_id": ra["id"], "case_b_id": rb["id"], "level": level, "score": score, "reasons": reasons,
                                  "decision": {"open": "none", "confirmed": "confirmed", "dismissed": "dismissed"}[status],
                                  "created_at": _ts(day + timedelta(hours=2))})
                    pid_ += 1
            clusters.append({"group_id": gid, "level": level, "anchor_key": anchor, "tier": tier, "case_ids": ids})
            gid += 1
        return groups, pairs, clusters

    # ── ground truth ─────────────────────────────────────────────────────

    def ground_truth(self, clusters: List[dict]) -> dict:
        rng = self.rng
        truth: Dict[int, Optional[str]] = {}
        for c in self.tiny_cases:
            truth[c["id"]] = c["permanent_id"]
        truth[113] = next(r for r in self.base["reviews"]["reviews"] if r["case_id"] == 113)["candidates"][0]["permanent_id"]  # the fixture's review decision
        truth.update(self.truth)
        roots = sorted({self.families.root(p) for p in truth.values() if p})
        rng.shuffle(roots)
        dev_roots = set(roots[: len(roots) // 2])
        split = {r: ("dev" if r in dev_roots else "test") for r in roots}
        case_split = {cid: split[self.families.root(p)] for cid, p in truth.items() if p}
        story = {g["id"]: g for g in self.base["overlaps"]["groups"]}
        hero = [{"group_id": g, "level": story[g]["level"], "anchor_key": story[g]["anchor_key"], "tier": story[g]["tier"],
                 "case_ids": [link["case_id"] for link in story[g]["links"]]} for g in (1, 2, 4)]  # group 3 is the dismissed parent group
        for c in clusters + hero:
            c["split"] = split[self.families.root(self.anchor_pid(c))]
        negatives = []
        for label, ids in sorted(self.group_cases.items()):
            kind = label.split("|")[0]
            if kind in HARD_NEGATIVES:
                negatives.append({"kind": kind, "case_ids": ids, "permanent_ids": [truth[i] for i in ids]})
        return {
            "seed": self.seed, "as_of": AS_OF.isoformat(),
            "case_to_permanent_id": {str(k): v for k, v in sorted(truth.items())},
            "noise": {str(k): v for k, v in sorted(self.tags.items())},
            "overlap_clusters": hero + clusters,
            "hard_negatives": negatives,
            "split_by_family": {r: s for r, s in sorted(split.items())},
            "dev_case_ids": sorted(c for c, s in case_split.items() if s == "dev"),
            "test_case_ids": sorted(c for c, s in case_split.items() if s == "test"),
        }

    def anchor_pid(self, cluster: dict) -> str:
        anchor = cluster["anchor_key"]
        if anchor.startswith("trust:"):
            trust_id = int(anchor.split(":")[1])
            return next(i["permanent_id"] for i in self.registry.institutions if i["trust_id"] == trust_id)
        return anchor.split(":")[-1]

    # ── run ──────────────────────────────────────────────────────────────

    def build(self) -> Tuple[Dict[str, object], dict]:
        self.specs: List[Spec] = []
        self.build_registry()
        self.plan_planted()
        self.plan_hard_negatives()
        self.plan_background()
        self.materialise()
        reviews = self.base["reviews"]["reviews"] + self.build_reviews()
        groups, pairs, clusters = self.build_overlaps()
        as_of = AS_OF.isoformat()
        files: Dict[str, object] = {
            "bureaus": self.base["bureaus"], "categories": self.base["categories"], "users": {"users": self.users},
            "institutions": {"trusts": self.registry.trusts, "institutions": self.registry.institutions,
                             "aliases": self.base["institutions"]["aliases"]},
            "cases": {"as_of": as_of, "cases": self.tiny_cases + self.rows},
            "reviews": {"as_of": as_of, "reviews": reviews},
            "overlaps": {"as_of": as_of, "groups": groups, "pairs": pairs},
            "alerts": self.base["alerts"], "ground_truth": self.ground_truth(clusters),
        }
        return files, self.summary(files)

    def summary(self, files: Dict[str, object]) -> dict:
        cases = files["cases"]["cases"]  # type: ignore[index]
        generated = self.rows
        n = len(generated)
        clean = sum(s.clean_location for s in self.specs)  # location noise is not applied to the hard negatives
        rate = lambda tag: round(  # noqa: E731
            100 * sum(tag in t for t in self.tags.values()) / (n - clean if tag in LOCATION_TAGS else n), 1)
        return {
            "institutions": len(files["institutions"]["institutions"]),  # type: ignore[index]
            "trusts": len(files["institutions"]["trusts"]),  # type: ignore[index]
            "universities": sum(i["inst_type"] == "university" for i in self.registry.institutions),
            "cases": len(cases),
            "actions": sum(len(c["actions"]) for c in cases),
            "channel_pct": {ch: round(100 * v / n, 1) for ch, v in sorted(Counter(r["source_channel"] for r in generated).items())},
            "status": dict(sorted(Counter(r["status"] for r in generated).items())),
            "noise_pct": {t: rate(t) for t in ("typo", "abbreviation", "acronym_only", "district_missing", "city_for_district", "wrong_state")},
            "planted_overlaps": {lvl: sum(1 for g in self.group_cases if g.startswith(f"{lvl}|")) for lvl in PLANTED},
            "hard_negatives": {k: sum(1 for g in self.group_cases if g.startswith(f"{k}|")) for k in HARD_NEGATIVES},
            "reviews": len(files["reviews"]["reviews"]),  # type: ignore[index]
            "overlap_groups": len(files["overlaps"]["groups"]),  # type: ignore[index]
        }
