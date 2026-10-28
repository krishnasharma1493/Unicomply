"""Cases: what each complaint is about, how it is written, and its chronological action history."""

import random
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Dict, List, Mapping, Optional, Tuple

from . import noise, vocab

AS_OF = date(2026, 11, 20)
LAST_DAY = AS_OF - timedelta(days=1)  # nothing happens "today": the demo adds that
CHANNELS = [("cpgrams", 45), ("aicte_portal", 20), ("email", 15), ("ro_referral", 10), ("rb_suo_motu", 5), ("inspection", 5)]
CATEGORY_WEIGHT = {
    "fee_refund": 14, "certificate_withheld": 14, "admission_irregularity": 8, "faculty_shortage": 10, "infrastructure_deficiency": 8,
    "salary_non_payment": 6, "ragging": 5, "unapproved_course": 6, "scholarship": 12, "harassment": 5, "exam_result": 8, "other": 4,
}
COMPLAINANT = {
    "cpgrams": [("student", 40), ("parent", 25), ("faculty", 15), ("staff", 10), ("public", 10)],
    "aicte_portal": [("student", 40), ("parent", 25), ("faculty", 15), ("staff", 10), ("anonymous", 10)],
    "email": [("student", 35), ("parent", 30), ("faculty", 15), ("public", 15), ("anonymous", 5)],
    "ro_referral": [("student", 40), ("parent", 30), ("public", 30)],
    "rb_suo_motu": [("internal", 100)],
    "inspection": [("internal", 100)],
}
# Action chains. Each one obeys the §4.3 transition table.
OPEN_PATHS = ["received", "assigned", "interim", "escalated"]
PATHS: Dict[str, List[str]] = {
    "received": [], "assigned": ["assign"], "interim": ["assign", "interim_reply"], "escalated": ["assign", "escalate"],
    "disposed": ["assign", "dispose"], "disposed_interim": ["assign", "interim_reply", "dispose"],
    "reopened": ["assign", "dispose", "reopen"], "transferred": ["assign", "transfer"], "transferred_assigned": ["assign", "transfer", "assign"],
}
AGE_BUCKETS: List[Tuple[int, Dict[str, int]]] = [
    (7, {"received": 45, "assigned": 45, "interim": 5, "escalated": 5}),
    (21, {"received": 10, "assigned": 40, "interim": 15, "escalated": 10, "disposed": 15, "transferred": 5, "transferred_assigned": 5}),
    (60, {"received": 2, "assigned": 22, "interim": 15, "escalated": 12, "disposed": 28, "disposed_interim": 8, "reopened": 3, "transferred": 5, "transferred_assigned": 5}),
    (10_000, {"assigned": 8, "interim": 8, "escalated": 10, "disposed": 42, "disposed_interim": 12, "reopened": 8, "transferred": 6, "transferred_assigned": 6}),
]
STATUS_AFTER = {"assign": "under_process", "interim_reply": "interim_reply", "transfer": "transferred", "escalate": "escalated",
                "dispose": "disposed", "reopen": "reopened"}
OUTCOMES = [("redressed", 50), ("action_taken_against_institution", 20), ("rejected_not_maintainable", 20), ("forwarded_to_institution_grc", 10)]
SLA_AFTER_REOPEN = 21


def pick(rng: random.Random, weighted: List[Tuple[str, int]]) -> str:
    return rng.choices([v for v, _ in weighted], [w for _, w in weighted])[0]


@dataclass
class Spec:
    """Everything decided about a case before any text is written."""

    pid: Optional[str]  # the true institution; None when it is not in the registry
    bureau_id: int
    category: str
    channel: str
    received: date
    resolution: str = "auto"  # auto / provided / reviewed / pending / unresolved
    paths: Tuple[str, ...] = tuple(OPEN_PATHS)  # which action chains this case may follow
    path: Optional[str] = None  # force one
    core: Optional[int] = None  # same value in two cases = the same matter (planted overlaps)
    ask: Optional[int] = None
    clean_location: bool = False  # hard negatives keep their state and district intact
    unknown_name: Optional[str] = None
    unknown_where: Optional[Dict[str, str]] = None
    can_transfer: bool = False
    group: str = ""  # planted-cluster / hard-negative label


class Staff:
    """Who acts on a case in each bureau (heads and RO officers act; case officers are assigned)."""

    def __init__(self, users: List[dict], regional_office: Mapping[str, int]) -> None:
        self.actors: Dict[int, int] = {}
        self.officers: Dict[int, List[int]] = {}
        self.regional_office = regional_office
        for u in users:
            if u["bureau_id"] is None:
                continue
            if u["role"] in ("bureau_head", "ro_officer"):
                self.actors.setdefault(u["bureau_id"], u["id"])
            elif u["role"] == "case_officer":
                self.officers.setdefault(u["bureau_id"], []).append(u["id"])

    def actor(self, bureau_id: int) -> int:
        return self.actors.get(bureau_id) or (self.officers.get(bureau_id) or [1])[0]

    def officer(self, rng: random.Random, bureau_id: int) -> Optional[int]:
        ids = self.officers.get(bureau_id)
        return rng.choice(ids) if ids else None


def description(rng: random.Random, complainant: str, category: str, core: Optional[int], ask: Optional[int]) -> str:
    _, issues = vocab.CATEGORY_TEXT[category]
    j = rng.randrange(len(issues)) if core is None else core % len(issues)
    k = rng.randrange(len(vocab.ASKS)) if ask is None else ask % len(vocab.ASKS)
    return f"{vocab.OPENINGS[complainant]} {issues[j]} {vocab.ASKS[k]}"


def pick_path(rng: random.Random, spec: Spec) -> str:
    if spec.path:
        return spec.path
    age = (AS_OF - spec.received).days
    weights = next(w for limit, w in AGE_BUCKETS if age <= limit)
    allowed = {p: w for p, w in weights.items() if p in spec.paths and (spec.can_transfer or not p.startswith("transferred"))}
    return rng.choices(list(allowed), list(allowed.values()))[0]


def history(rng: random.Random, spec: Spec, staff: Staff, categories: Mapping[str, dict], all_bureaus: List[int]) -> dict:
    """Walk the chain with increasing timestamps; steps that would fall after LAST_DAY are never taken."""
    steps = list(PATHS[pick_path(rng, spec)])
    sla = categories[spec.category]["default_sla_days"]
    state = {
        "status": "received", "bureau": spec.bureau_id, "officer": None, "escalation": 0, "reopen": 0,
        "disposed_at": None, "expected": None, "sla_due": spec.received + timedelta(days=sla),
    }
    actions: List[dict] = []
    when = datetime.combine(spec.received, datetime.min.time()) + timedelta(days=rng.randint(1, 3), hours=rng.randint(9, 16))
    for step in steps:
        if rng.random() < 0.2:  # an occasional remark does not change the status
            actions.append(_action(rng, staff, spec, state, "remark", when - timedelta(hours=1)))
        if when.date() > LAST_DAY:
            break
        extra = {}
        if step == "assign":
            state["officer"] = staff.officer(rng, state["bureau"])
            extra["to_officer_id"] = state["officer"]
        elif step == "transfer":
            options = [b for b in all_bureaus if b != state["bureau"]]
            extra.update(from_bureau_id=state["bureau"], to_bureau_id=rng.choice(options))
        elif step == "dispose":
            extra["outcome"] = pick(rng, OUTCOMES)
        actions.append(_action(rng, staff, spec, state, step, when, **extra))
        state["status"] = STATUS_AFTER[step]
        if step == "transfer":
            state["bureau"], state["officer"] = extra["to_bureau_id"], None
        elif step == "escalate":
            state["escalation"] += 1
        elif step == "interim_reply":
            state["expected"] = when.date() + timedelta(days=rng.randint(7, 21))
        elif step == "dispose":
            state["disposed_at"] = when
        elif step == "reopen":
            state["reopen"] += 1
            state["disposed_at"] = None
            state["sla_due"] = when.date() + timedelta(days=SLA_AFTER_REOPEN)
        when += timedelta(days=rng.randint(1, 10), hours=rng.randint(0, 5))
    actions = [a for a in actions if a["created_at"] <= _ts(datetime.combine(LAST_DAY, datetime.max.time()))]
    actions.sort(key=lambda a: a["created_at"])
    return {**state, "actions": actions}


def _action(rng: random.Random, staff: Staff, spec: Spec, state: dict, kind: str, when: datetime, **extra: object) -> dict:
    return {
        "action_type": kind, "actor_id": staff.actor(state["bureau"]), "bureau_id": state["bureau"],
        "from_bureau_id": extra.get("from_bureau_id"), "to_bureau_id": extra.get("to_bureau_id"),
        "to_officer_id": extra.get("to_officer_id"), "outcome": extra.get("outcome"),
        "remarks": rng.choice(vocab.REMARKS[kind]), "created_at": _ts(when),
    }


def _ts(when: datetime) -> str:
    return when.strftime("%Y-%m-%dT%H:%M:%SZ")


def case_row(
    rng: random.Random, spec: Spec, cid: int, ref: str, first_action_id: int, inst: Optional[dict],
    staff: Staff, categories: Mapping[str, dict], category_ids: Mapping[str, int], all_bureaus: List[int],
    inverse: Mapping[str, List[str]], states: List[str], district_noise: str = "none", wrong_state: bool = False,
) -> Tuple[dict, List[str]]:
    """One case dict (with embedded `actions`) and the noise tags applied to its institution text."""
    channel = spec.channel
    ctype = pick(rng, COMPLAINANT[channel])
    hist = history(rng, spec, staff, categories, all_bureaus)
    for n, a in enumerate(hist["actions"]):
        a.update(id=first_action_id + n, case_id=cid)
    tags: List[str] = []
    state_name = inst["state"] if inst else spec.unknown_where["state"]  # type: ignore[index]
    district: Optional[str] = inst["district"] if inst else spec.unknown_where["district"]  # type: ignore[index]
    name = inst["name"] if inst else spec.unknown_name or ""
    acr = inst["acronym"] if inst else noise.acronym(name)

    raw_district: Optional[str] = district
    if district_noise == "missing":
        raw_district = None
        tags.append("district_missing")
    elif district_noise == "city":
        raw_district = vocab.LOCALITIES.get(district or "", district)
        tags.append("city_for_district")
    if wrong_state:
        state_name = rng.choice([s for s in states if s != state_name])
        tags.append("wrong_state")
    text_district = district if raw_district is None and rng.random() < 0.5 else None
    raw_text, name_tags = noise.write_name(rng, name, acr, text_district, inverse)
    tags += name_tags

    match_status, score, pid = {
        "auto": ("auto", round(rng.uniform(0.78, 0.99), 2), spec.pid),
        "provided": ("provided", 1.0, spec.pid),
        "reviewed": ("reviewed", round(rng.uniform(0.55, 0.78), 2), spec.pid),
        "pending": ("pending_review", round(rng.uniform(0.50, 0.67), 2), None),
        "unresolved": ("unresolved", None, None),
    }[spec.resolution]
    cat_id = category_ids[spec.category]
    last = hist["actions"][-1] if hist["actions"] else None
    received_at = datetime.combine(spec.received, datetime.min.time()) + timedelta(hours=rng.randint(7, 11))
    external = None
    if channel == "cpgrams":
        external = f"AICTE/E/2026/{rng.randint(1, 9_999_999):07d}"
    elif channel == "aicte_portal":
        external = f"FB-2026-{rng.randint(1, 999_999):06d}"
    row = {
        "id": cid, "case_ref": ref, "source_channel": channel, "external_ref": external, "received_at": spec.received.isoformat(),
        "complainant_type": ctype,
        "complainant_name": None if ctype in ("anonymous", "internal") else f"{rng.choice(vocab.FIRST_NAMES)} {rng.choice(vocab.LAST_NAMES)}",
        "raw_institution_text": raw_text, "raw_state": state_name, "raw_district": raw_district,
        "permanent_id": pid, "match_score": score, "match_status": match_status,
        "category_id": cat_id, "category_suggested_id": None,
        "subject": rng.choice(vocab.CATEGORY_TEXT[spec.category][0]),
        "description": description(rng, ctype, spec.category, spec.core, spec.ask),
        "status": hist["status"], "current_bureau_id": hist["bureau"], "assigned_officer_id": hist["officer"],
        "last_action_type": last["action_type"] if last else None, "last_action_at": last["created_at"] if last else None,
        "next_action": None if hist["status"] == "disposed" else rng.choice(vocab.NEXT_ACTIONS),
        "expected_disposal_date": hist["expected"].isoformat() if hist["expected"] and hist["status"] == "interim_reply" else None,
        "sla_due_on": hist["sla_due"].isoformat(),
        "disposed_at": _ts(hist["disposed_at"]) if hist["disposed_at"] else None,
        "reopen_count": hist["reopen"], "escalation_level": hist["escalation"], "delay_risk": None,
        "created_by": 5, "created_at": _ts(received_at),
        "updated_at": last["created_at"] if last else _ts(received_at),
        "actions": hist["actions"],
    }
    return row, tags
