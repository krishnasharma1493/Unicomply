from datetime import date, timedelta

from app.matching.embed import make_embedder
from app.matching.index import build_index
from app.matching.types import AliasLite, CaseLite, InstitutionLite


def registry():
    return [
        InstitutionLite("1-0000000001", "North University", "NORTH UNIVERSITY", "NU", "City", "State", "central", 8),
        InstitutionLite("1-0000000002", "North Engineering", "NORTH ENGINEERING", "NE", "City", "State", "central", 8, "1-0000000001"),
        InstitutionLite("1-0000000003", "North Management", "NORTH MANAGEMENT", "NM", "City", "State", "central", 8, "1-0000000001"),
        InstitutionLite("1-0000000004", "South College", "SOUTH COLLEGE", "SC", "Other", "State", "central", 9),
        InstitutionLite("1-0000000005", "West College", "WEST COLLEGE", "WC", "Other", "State", "central", 8),
    ]


def test_index_relationships_aliases_similarity_and_upsert():
    inst = registry()
    cases = [CaseLite(1, "A/1", inst[1].permanent_id, 1, "RB", "fee_refund", "refund ignored", date(2026, 1, 1), "received")]
    index = build_index(inst, [AliasLite("NE", inst[1].permanent_id, "seed")], cases, [(1, 2)], make_embedder("tfidf", "unused"), {8: "North Group"})
    assert index.level_between(inst[1].permanent_id, inst[2].permanent_id) == "parent"
    assert index.level_between(inst[1].permanent_id, inst[4].permanent_id) == "trust"
    assert index.resolve_alias("NE") == inst[1].permanent_id
    assert index.name_similarity("NORTH ENGINEERING CITY STATE", [inst[1].permanent_id])[inst[1].permanent_id] > 0.5
    assert index.trust_name(8) == "North Group"
    assert index.is_dismissed(2, 1)
    index.add_alias("NORTH ENG", inst[1].permanent_id)
    assert index.resolve_alias("NORTH ENG") == inst[1].permanent_id
    updated = CaseLite(2, "A/2", inst[1].permanent_id, 2, "PGRC", "fee_refund", "refund complaint", date(2026, 1, 2), "received")
    index.upsert_case(updated)
    assert index.description_similarity(1, 2) > 0
    assert updated in index.related_cases(inst[1].permanent_id, 180, date(2026, 1, 3))


def test_related_cases_excludes_old_disposed_items():
    inst = registry()[0]
    cases = [
        CaseLite(1, "A/1", inst.permanent_id, 1, "RB", "fee_refund", "x", date(2024, 1, 1), "disposed", date(2024, 1, 2)),
        CaseLite(2, "A/2", inst.permanent_id, 1, "RB", "fee_refund", "y", date(2026, 1, 1), "disposed", date(2026, 1, 2)),
    ]
    index = build_index([inst], [], cases, [], make_embedder("tfidf", "unused"))
    assert [c.id for c in index.related_cases(inst.permanent_id, 180, date(2026, 1, 3))] == [2]
