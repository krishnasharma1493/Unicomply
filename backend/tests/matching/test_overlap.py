from datetime import date

from app.matching.embed import make_embedder
from app.matching.index import build_index
from app.matching.overlap import detect_overlaps, issue_clusters, pair_score, plan_group_updates
from app.matching.thresholds import load_thresholds
from app.matching.types import CaseLite, GroupLite, InstitutionLite, PairEvidence


def setup_world():
    institutions = [
        InstitutionLite("1-0000000001", "One Institute", "ONE INSTITUTE", "OI", "City", "State", "central", 1),
        InstitutionLite("1-0000000002", "Two Institute", "TWO INSTITUTE", "TI", "City", "State", "central", 1),
    ]
    old = CaseLite(1, "PGRC/1", institutions[0].permanent_id, 2, "PGRC", "certificate_withheld", "refund held certificate", date(2026, 1, 1), "under_process")
    rb = CaseLite(2, "RB/2", institutions[0].permanent_id, 1, "RB", "certificate_withheld", "refund held certificate", date(2026, 1, 2), "under_process")
    sibling = CaseLite(3, "RB/3", institutions[1].permanent_id, 1, "RB", "certificate_withheld", "refund held certificate", date(2026, 1, 2), "under_process")
    idx = build_index(institutions, [], [old, rb, sibling], [], make_embedder("tfidf", "unused"), {1: "Group One"})
    th = load_thresholds()
    return institutions, old, rb, sibling, idx, th


def test_pair_score_categories_and_levels_are_weighted():
    _, old, rb, _, idx, th = setup_world()
    assert pair_score(old, rb, "institution", idx, th) > pair_score(old, rb, "trust", idx, th)
    unrelated = CaseLite(4, "A/4", old.permanent_id, 3, "AB", "other", "refund held certificate", date(2026, 1, 1), "received")
    idx.upsert_case(unrelated)
    assert pair_score(old, unrelated, "institution", idx, th) < pair_score(old, rb, "institution", idx, th)


def test_cross_bureau_pairs_are_included_and_dismissed_pairs_skipped():
    _, old, rb, sibling, idx, th = setup_world()
    evidence = detect_overlaps(sibling, [old, rb], idx, th)
    assert any(pair.level == "trust" and pair.case_a == 1 and pair.case_b == 3 for pair in evidence) is False
    # Same-institution cross-bureau evidence is included even if semantic score is low.
    assert any(pair.level == "institution" and pair.case_a == 2 and pair.case_b == 3 for pair in evidence) is False
    idx.dismissed.add((1, 3))
    assert detect_overlaps(sibling, [old], idx, th) == []


def test_complete_linkage_does_not_chain_a_weak_pair():
    pairs = [
        PairEvidence.of(1, 2, "institution", 0.9, ("strong",)),
        PairEvidence.of(2, 3, "institution", 0.9, ("strong",)),
        PairEvidence.of(1, 3, "institution", 0.2, ("weak",)),
    ]
    clusters = issue_clusters([1, 2, 3], pairs, 0.45)
    assert [cluster.case_ids for cluster in clusters] == [(1, 2), (3,)]


def test_plan_uses_registry_anchor_and_reopens_only_with_new_pairs():
    institutions, old, rb, _, idx, th = setup_world()
    new = CaseLite(4, "PGRC/4", old.permanent_id, 2, "PGRC", old.category_code, old.description, date(2026, 1, 3), "received")
    idx.upsert_case(new)
    evidence = detect_overlaps(new, [old, rb], idx, th)
    [created] = plan_group_updates(new, evidence, [], idx, th)
    assert created.anchor_key == new.permanent_id and created.action == "create"
    assert created.tier == "probable"
    prior = GroupLite(8, "institution", new.permanent_id, "possible", "dismissed", (old.id, rb.id))
    [reopened] = plan_group_updates(new, evidence, [prior], idx, th)
    assert reopened.action == "reopen" and reopened.group_id == 8
    assert set(reopened.case_ids) == {new.id, old.id, rb.id}
    assert reopened.pairs == tuple(evidence)
