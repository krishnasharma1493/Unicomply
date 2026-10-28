"""The synthetic data generator (#23): determinism, spec counts and rates, integrity, ground truth."""

import json
import subprocess
import sys
import time
from collections import Counter
from datetime import date, datetime, timedelta
from itertools import combinations
from pathlib import Path
from typing import Any, Dict, Iterator, List, Set

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.modules.cases.workflow import ALLOWED
from app.seed import SEED_DIR, TINY_SEED_DIR, load_seed
from tests.conftest import DEMO_PASSWORD, SEED_AS_OF, _client_for, _memory_engine

BACKEND = Path(__file__).resolve().parents[1]
FILES = ("bureaus", "categories", "users", "institutions", "cases", "reviews", "overlaps", "alerts", "ground_truth")
WINDOW_DAYS = 180


def generate(out: Path) -> None:
    result = subprocess.run([sys.executable, "-m", "seed_data.generator", "--seed", "26264", "--output", str(out)],
                            cwd=BACKEND, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def read(directory: Path, name: str) -> Any:
    return json.loads((directory / f"{name}.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def out(tmp_path_factory: pytest.TempPathFactory) -> Path:
    directory = tmp_path_factory.mktemp("generated")
    generate(directory)
    return directory


@pytest.fixture(scope="module")
def data(out: Path) -> Dict[str, Any]:
    return {name: read(out, name) for name in FILES}


# ── Acceptance criteria ──────────────────────────────────────────────────


def test_same_seed_gives_byte_identical_files(out: Path, tmp_path: Path) -> None:
    generate(tmp_path)
    for name in FILES:
        assert (out / f"{name}.json").read_bytes() == (tmp_path / f"{name}.json").read_bytes(), name


def test_a_different_seed_gives_different_data(out: Path, tmp_path: Path) -> None:
    subprocess.run([sys.executable, "-m", "seed_data.generator", "--seed", "7", "--output", str(tmp_path)], cwd=BACKEND, check=True, capture_output=True)
    assert (out / "cases.json").read_bytes() != (tmp_path / "cases.json").read_bytes()


def test_checked_in_seed_is_what_the_generator_writes(out: Path) -> None:
    """The files in seed_data/ are the generator's output for seed 26264, not hand edits."""
    for name in FILES:
        assert (SEED_DIR / f"{name}.json").read_bytes() == (out / f"{name}.json").read_bytes(), f"re-run the generator: {name}.json"


def test_full_seed_loads_in_under_ten_seconds(out: Path) -> None:
    engine = _memory_engine()
    from sqlmodel import SQLModel

    SQLModel.metadata.create_all(engine)
    started = time.perf_counter()
    with Session(engine) as session:
        counts = load_seed(session, out, today=SEED_AS_OF)
    assert time.perf_counter() - started < 10
    assert counts["cases"] == 1500 and counts["institutions"] == 500


def within(actual: float, target: float, tolerance: float = 0.10) -> bool:
    return abs(actual - target) <= tolerance * target


def test_counts_are_within_ten_percent_of_the_spec(data: Dict[str, Any]) -> None:
    institutions = data["institutions"]["institutions"]
    assert within(len(institutions), 500) and within(len(data["institutions"]["trusts"]), 60)
    assert within(sum(i["inst_type"] == "university" for i in institutions), 15)
    assert within(len(data["cases"]["cases"]), 1500)
    assert len(data["bureaus"]["bureaus"]) == 14  # RB, PGRC, AB, ACAD and the 10 Regional Offices
    clusters = Counter(c["level"] for c in data["ground_truth"]["overlap_clusters"] if c["group_id"] > 4)
    assert (clusters["institution"], clusters["parent"], clusters["trust"]) == (30, 5, 10)
    assert Counter(n["kind"] for n in data["ground_truth"]["hard_negatives"]) == {"same_name_other_state": 10, "disposed_long_ago": 10}


def test_channel_mix_and_noise_rates_are_within_ten_percent(data: Dict[str, Any]) -> None:
    cases = [c for c in data["cases"]["cases"] if c["id"] > 200]
    for channel, share in {"cpgrams": 45, "aicte_portal": 20, "email": 15, "ro_referral": 10}.items():
        assert within(100 * sum(c["source_channel"] == channel for c in data["cases"]["cases"]) / 1500, share), channel
    both = sum(c["source_channel"] in ("rb_suo_motu", "inspection") for c in data["cases"]["cases"])
    assert within(100 * both / 1500, 10)
    noise = data["ground_truth"]["noise"]
    clean = 40  # hard-negative cases keep their location intact
    rate = lambda tag, n: 100 * sum(tag in t for t in noise.values()) / n  # noqa: E731
    for tag, target in {"typo": 40, "abbreviation": 35, "acronym_only": 15}.items():
        assert within(rate(tag, len(cases)), target), tag
    for tag, target in {"district_missing": 20, "city_for_district": 10, "wrong_state": 2}.items():
        assert within(rate(tag, len(cases) - clean), target), tag


def test_hero_story_is_the_hand_written_one(data: Dict[str, Any]) -> None:
    tiny = read(TINY_SEED_DIR, "cases")["cases"]
    assert data["cases"]["cases"][: len(tiny)] == tiny
    refs = {c["case_ref"]: c for c in tiny}
    assert refs["PGRC/2026/00412"]["raw_institution_text"] == "VVIET Jabalpur"
    assert refs["RB/2026/00079"]["status"] == "escalated"
    assert [a for a in data["alerts"]["alerts"]] == read(TINY_SEED_DIR, "alerts")["alerts"]


def test_every_name_is_fictional_and_unique_except_the_deliberate_twins(data: Dict[str, Any]) -> None:
    names = Counter(i["name"] for i in data["institutions"]["institutions"])
    twins = {n for n, c in names.items() if c > 1}
    expected = {"Narmada Valley College of Engineering"}  # the tiny seed's own same-name pair (Madhya Pradesh / Gujarat)
    assert len(twins - expected) == 10
    for row in data["institutions"]["institutions"]:
        assert "Vindhya" not in row["name"] or row["permanent_id"] in {"1-4812730561", "1-4812730987"}
        assert row["permanent_id"].startswith("1-") and len(row["permanent_id"]) == 12


# ── Integrity ────────────────────────────────────────────────────────────


def test_references_resolve(data: Dict[str, Any]) -> None:
    pids = {i["permanent_id"] for i in data["institutions"]["institutions"]}
    trust_ids = {t["id"] for t in data["institutions"]["trusts"]}
    bureaus = {b["id"] for b in data["bureaus"]["bureaus"]}
    categories = {c["id"] for c in data["categories"]["categories"]}
    users = {u["id"] for u in data["users"]["users"]}
    for inst in data["institutions"]["institutions"]:
        assert inst["trust_id"] in trust_ids | {None} and inst["parent_id"] in pids | {None}
    for case in data["cases"]["cases"]:
        assert case["permanent_id"] in pids | {None}
        assert case["current_bureau_id"] in bureaus and case["category_id"] in categories and case["created_by"] in users
        assert case["assigned_officer_id"] in users | {None}
    assert len({c["case_ref"] for c in data["cases"]["cases"]}) == 1500
    assert len({u["email"] for u in data["users"]["users"]}) == len(data["users"]["users"])
    assert len({a["id"] for c in data["cases"]["cases"] for a in c["actions"]}) == sum(len(c["actions"]) for c in data["cases"]["cases"])


def test_histories_are_chronological_and_obey_the_state_machine(data: Dict[str, Any]) -> None:
    as_of = datetime(2026, 11, 20)
    for case in data["cases"]["cases"]:
        status, received = "received", date.fromisoformat(case["received_at"])
        previous = None
        for action in case["actions"]:
            at = datetime.fromisoformat(action["created_at"].replace("Z", ""))
            assert at.date() >= received and at < as_of
            assert previous is None or at >= previous, case["case_ref"]
            previous = at
            allowed_from, status_after = (lambda a: ALLOWED[a])(next(t for t in ALLOWED if t.value == action["action_type"]))
            assert status in {s.value for s in allowed_from}, f"{case['case_ref']}: {action['action_type']} from {status}"
            status = status_after.value if status_after else status
        assert case["status"] == status, case["case_ref"]
        last = case["actions"][-1] if case["actions"] else None
        assert case["last_action_type"] == (last["action_type"] if last else None)
        assert case["last_action_at"] == (last["created_at"] if last else None)
        assert case["escalation_level"] == sum(a["action_type"] == "escalate" for a in case["actions"])
        assert case["reopen_count"] == sum(a["action_type"] == "reopen" for a in case["actions"])
        assert (case["disposed_at"] is not None) == (case["status"] == "disposed")


def test_dates_stay_inside_the_nine_month_window(data: Dict[str, Any]) -> None:
    generated = [c for c in data["cases"]["cases"] if c["id"] > 200]
    received = [date.fromisoformat(c["received_at"]) for c in generated]
    assert max(received) < SEED_AS_OF and min(received) >= SEED_AS_OF - timedelta(days=270)


# ── Ground truth ─────────────────────────────────────────────────────────


def families(data: Dict[str, Any]) -> Dict[str, str]:
    parent: Dict[str, str] = {i["permanent_id"]: i["permanent_id"] for i in data["institutions"]["institutions"]}

    def root(x: str) -> str:
        while parent[x] != x:
            x = parent[x]
        return x

    first_of_trust: Dict[int, str] = {}
    for i in data["institutions"]["institutions"]:
        if i["parent_id"]:
            parent[root(i["permanent_id"])] = root(i["parent_id"])
        if i["trust_id"] is not None:
            parent[root(i["permanent_id"])] = root(first_of_trust.setdefault(i["trust_id"], i["permanent_id"]))
    return {pid: root(pid) for pid in parent}


def test_truth_covers_every_case_and_matches_resolved_ones(data: Dict[str, Any]) -> None:
    truth = data["ground_truth"]["case_to_permanent_id"]
    assert set(truth) == {str(c["id"]) for c in data["cases"]["cases"]}
    for case in data["cases"]["cases"]:
        if case["permanent_id"]:
            assert truth[str(case["id"])] == case["permanent_id"], case["case_ref"]
    pending = [c for c in data["cases"]["cases"] if c["match_status"] in ("pending_review", "unresolved") and c["id"] > 200]
    assert len(pending) == 20 and all(c["permanent_id"] is None for c in pending)
    assert sum(truth[str(c["id"])] is None for c in pending) == 4  # the four institutions that are not in the registry


def test_dev_and_test_split_by_institution_family(data: Dict[str, Any]) -> None:
    truth, gt = data["ground_truth"]["case_to_permanent_id"], data["ground_truth"]
    fam = families(data)
    dev, test = set(gt["dev_case_ids"]), set(gt["test_case_ids"])
    assert not dev & test and abs(len(dev) - len(test)) < 0.25 * (len(dev) + len(test))
    side: Dict[str, str] = {}
    for cid in dev | test:
        root = fam[truth[str(cid)]]
        assert side.setdefault(root, "dev" if cid in dev else "test") == ("dev" if cid in dev else "test"), "a family straddles dev and test"
    for cluster in gt["overlap_clusters"]:
        assert len({side[fam[truth[str(c)]]] for c in cluster["case_ids"]}) == 1, "a planted overlap straddles dev and test"


def open_or_recent(case: dict) -> bool:
    if case["status"] != "disposed":
        return True
    return datetime.fromisoformat(case["disposed_at"].replace("Z", "")).date() >= SEED_AS_OF - timedelta(days=WINDOW_DAYS)


def test_planted_overlaps_are_what_the_engine_should_find(data: Dict[str, Any]) -> None:
    fam, by_id = families(data), {c["id"]: c for c in data["cases"]["cases"]}
    for cluster in (c for c in data["ground_truth"]["overlap_clusters"] if c["group_id"] > 4):
        cases = [by_id[i] for i in cluster["case_ids"]]
        assert 2 <= len(cases) <= 3 and len({c["current_bureau_id"] for c in cases}) == len(cases), "cross-bureau"
        assert all(open_or_recent(c) and c["status"] != "disposed" for c in cases)
        assert len({fam[c["permanent_id"]] for c in cases}) == 1
        if cluster["level"] == "institution":
            assert len({c["permanent_id"] for c in cases}) == 1
        else:
            assert len({c["permanent_id"] for c in cases}) == len(cases), "a parent / trust overlap spans different institutions"
        days = [date.fromisoformat(c["received_at"]) for c in cases]
        assert (max(days) - min(days)).days <= 45


def test_no_accidental_overlaps_hide_in_the_background(data: Dict[str, Any]) -> None:
    """Any two cases the rules call an overlap must be a planted (or hero) one, so precision is measurable."""
    fam, truth = families(data), data["ground_truth"]["case_to_permanent_id"]
    known: Set[frozenset] = set()
    for cluster in data["ground_truth"]["overlap_clusters"]:
        known |= {frozenset(p) for p in combinations(cluster["case_ids"], 2)}
    live = [c for c in data["cases"]["cases"] if truth[str(c["id"])] and open_or_recent(c)]
    hero_ids = {c["id"] for c in read(TINY_SEED_DIR, "cases")["cases"]}
    stray = [
        (a["case_ref"], b["case_ref"])
        for a, b in combinations(live, 2)
        if fam[truth[str(a["id"])]] == fam[truth[str(b["id"])]]
        and a["current_bureau_id"] != b["current_bureau_id"]
        and not (a["id"] in hero_ids and b["id"] in hero_ids)
        and frozenset((a["id"], b["id"])) not in known
    ]
    assert stray == []


def test_hard_negatives_are_not_overlaps(data: Dict[str, Any]) -> None:
    by_id, truth = {c["id"]: c for c in data["cases"]["cases"]}, data["ground_truth"]["case_to_permanent_id"]
    fam = families(data)
    for neg in data["ground_truth"]["hard_negatives"]:
        a, b = (by_id[i] for i in neg["case_ids"])
        if neg["kind"] == "same_name_other_state":
            ia = next(i for i in data["institutions"]["institutions"] if i["permanent_id"] == truth[str(a["id"])])
            ib = next(i for i in data["institutions"]["institutions"] if i["permanent_id"] == truth[str(b["id"])])
            assert ia["name"] == ib["name"] and ia["state"] != ib["state"] and fam[ia["permanent_id"]] != fam[ib["permanent_id"]]
            assert a["raw_state"] == ia["state"] and b["raw_state"] == ib["state"] and a["raw_district"] and b["raw_district"]
        else:
            old, new = sorted((a, b), key=lambda c: c["received_at"])
            assert old["permanent_id"] == new["permanent_id"] and old["current_bureau_id"] != new["current_bureau_id"]
            assert old["status"] == "disposed" and not open_or_recent(old) and new["status"] != "disposed"


# ── The hero intake on the full data ─────────────────────────────────────


@pytest.fixture(name="full_client")
def full_client_fixture(test_settings: Any) -> Iterator[TestClient]:
    from sqlmodel import SQLModel

    engine = _memory_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        load_seed(session, SEED_DIR, today=SEED_AS_OF)
    yield from _client_for(engine, test_settings)


def test_hero_intake_still_resolves_and_flags_the_overlap_among_500_institutions(full_client: TestClient) -> None:
    from app.core.fixtures import load_fixture
    from app.modules.engine import service

    service.reset_indexes()
    token = full_client.post("/api/v1/auth/login", json={"email": "intake@aicte.example", "password": DEMO_PASSWORD}).json()["data"]["access_token"]
    res = full_client.post("/api/v1/cases", json=load_fixture("requests/post_cases"), headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 201, res.text
    data = res.json()["data"]
    assert (data["case"]["permanent_id"], data["resolution"]["decision"]) == ("1-4812730561", "auto")
    assert [c["permanent_id"] for c in data["resolution"]["candidates"]][:2] == ["1-4812730561", "1-4812730987"]
    [group] = data["overlaps"]
    assert (group["level"], group["tier"]) == ("institution", "probable")
    assert {c["case_ref"] for c in group["cases"]} == {"PGRC/2026/00412", "RB/2026/00087", "RO-CRO/2026/00133"}
