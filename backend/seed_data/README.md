# `seed_data/` — the demo world and its file format

`python -m app.seed [--reset]` (and `POST /api/v1/demo/reset`) loads these files into an empty schema in one transaction, in foreign-key order. **This README is the contract for the synthetic generator (#23):** it must write the same files, with the same fields, at scale.

The current files are the **tiny seed** (#6). It is exactly the world described by `contract/fixtures/` (#2): the same ids, case refs, people, hero story, overlap groups, reviews and alerts, plus two institutions without cases. So the real API answers like the frontend mocks.

## Conventions

- Ids are explicit integers (except `permanent_id`, a string `1-` + 6–10 digits, and `case_ref`). Seeding keeps them, so ids are stable across resets and issued tokens keep working.
- Enum values are the snake_case values in `app/core/enums.py` (the same as `frontend/src/lib/api/enums.ts`).
- Dates are `YYYY-MM-DD`; timestamps are UTC ISO 8601 ending in `Z`.
- **Relative dates.** A file with a top-level `as_of` date is shifted on load by `today() - as_of` days (`today()` honours `DEMO_TODAY`). Every date/timestamp **value** moves, plus the day inside each alert `dedupe_key`; dates written inside free text (remarks, `next_action`) do not. With `DEMO_TODAY` equal to `as_of` (2026-11-20) the data is identical to the contract fixtures; on any other day the hero case PGRC/2026/00412 is still on day 19 of 21.
- Fictional data only (PRD A6): no real institutions, complainants or officers.
- Files marked *optional* may be omitted (the generator need not write them; the overlap engine creates groups, pairs and alerts at runtime).

## Files

| File | Top-level keys | Rows |
| --- | --- | --- |
| `bureaus.json` | `bureaus` | `{id, code, name, kind (bureau / cell / regional_office), region}`: RB, PGRC, AB, ACAD and the 10 Regional Offices (`region` set only for ROs) |
| `categories.json` | `categories` | `{id, code, name, default_sla_days, default_bureau_code}`: the 12 PRD §4.1 categories |
| `users.json` | `users` | `{id, email, name, role, bureau_id, region, is_admin}`. Roles: `senior_mgmt`, `bureau_head`, `ro_officer`, `intake_operator` (the 5 personas, ids 1–5, which log in) and `case_officer` (data only: they appear as `assigned_officer_id` and can never log in) |
| `institutions.json` | `trusts`, `institutions`, `aliases` | Trusts `{id, name, address, state}`; institutions `{permanent_id, name, name_norm, acronym, address, district, state, pin, region, inst_type, year_est, trust_id, parent_id, is_active}` (a university department has `parent_id` = its university); aliases `{id, permanent_id, alias_norm, source (seed / review / official)}` |
| `cases.json` | `as_of`, `cases` | Every PRD §4.1 `case` column (`id, case_ref, source_channel, external_ref, received_at, complainant_type, complainant_name, raw_institution_text, raw_state, raw_district, permanent_id, match_score, match_status, category_id, category_suggested_id, subject, description, status, current_bureau_id, assigned_officer_id, last_action_type, last_action_at, next_action, expected_disposal_date, sla_due_on, disposed_at, reopen_count, escalation_level, delay_risk, created_by, created_at, updated_at`) plus `actions`: the case's history, oldest first, each `{id, case_id, action_type, actor_id, bureau_id, from_bureau_id, to_bureau_id, to_officer_id, outcome, remarks, created_at}`. `last_action_type` / `last_action_at` must equal the last action |
| `reviews.json` *(optional)* | `as_of`, `reviews` | `{id, case_id, candidates: [{permanent_id, name, district, state, score, reasons}], status (pending / resolved), decided_permanent_id, decided_by, decided_at, created_at}` |
| `overlaps.json` *(optional)* | `as_of`, `groups`, `pairs` | Groups `{id, level, anchor_key, tier, status, coordinator_id, decided_by, decided_at, decision_remark, created_at, updated_at, links: [{case_id, added_at}]}` (`anchor_key` = a Permanent ID, `parent:<permanent_id>` or `trust:<id>`); pairs `{id, case_a_id < case_b_id, level, score, reasons, decision (none / confirmed / dismissed), created_at}` |
| `alerts.json` *(optional)* | `as_of`, `alerts` | `{id, type, severity, recipient_id, case_id, group_id, permanent_id, title, body, dedupe_key (type:recipient:entity:date, unique), is_read, created_at}` |

The generator (#23) adds `ground_truth.json` (true Permanent ID per case, true overlap clusters, dev/test split). The loader ignores it; `python -m app.eval` (#40) reads it. `abbreviations.json` and `thresholds.json` belong to the matching engine (#19) and are not loaded into tables.

## What the tiny seed contains

| | Count | Notes |
| --- | --- | --- |
| Bureaus | 14 | RB 1, PGRC 2, AB 3, ACAD 4, Regional Offices 5–14 (5 = RO-CRO Central, 14 = RO-WRO Western) |
| Categories | 12 | ragging has a 7-day SLA, the rest 21 days |
| Users | 12 | personas 1–5, case officers 6–12 |
| Trusts / institutions / aliases | 3 / 10 / 5 | hero VVIET and its trust sibling; a university with two departments; `1-2491105538`, a same-name "Narmada Valley College of Engineering" in Gujarat (hard negative for the location veto); a Western-region institute |
| Cases / actions | 13 / 19 | the four §4.7 hero cases (PGRC/2026/00412 day −19 under process, RB/2026/00087 day −10 under process, RO-CRO/2026/00133 day −5 received, RB/2026/00079 day −30 escalated) and nine others covering every status; actions 1001–1019 |
| Reviews | 2 | pending (cases 112 and 113) |
| Overlap groups / pairs | 4 / 6 | 1 institution probable open (hero), 2 trust possible open, 3 parent possible dismissed, 4 institution possible open |
| Alerts | 6 | for the RB head |

The PRD's hero intake (`vindya valley engg college jabalpur`, live in demo step 4) is **not** seeded; it is created during the demo as PGRC/2026/00519.
