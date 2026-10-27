# Contract fixtures

One shared set of JSON responses for every Must endpoint in `docs/Unicomply PRD.md` §5. The backend stub routers (#7) and the frontend mock layer (#10) both serve these files, so the UI and the API agree from day one.

> **Contract change rule:** a contract change updates PRD §5, the Pydantic schema, the fixture here and the TS type, all in **one PR**. Never edit only one of them.

## Conventions

- Envelopes follow `docs/HACKATHON_PRD.md` §4–§5: `{success: true, data}`, `Page[T]` = `{success: true, data: [...], pagination: {total, page, limit, total_pages}}`, and errors are `{success: false, error: {code, message, fields?, details?}}`. `details` is only used where a domain error needs structured data, for example the linked case refs on `OPEN_OVERLAP`.
- `GET /health` is the only response with no envelope. It matches the implemented #1 endpoint: `{status, timestamp, environment, version}`.
- JSON keys are snake_case. Ids are integers except `permanent_id` (`1-` + 10 digits) and `case_ref`.
- Dates are ISO `YYYY-MM-DD`: `received_at`, `sla_due_on`, `expected_disposal_date`, `as_of`, report `from`/`to`. Timestamps are UTC ISO 8601 ending in `Z`.
- Path parameters become `id` or `permanent_id` in file names, and `-` becomes `_`. For example, `POST /alerts/{id}/read` → `post_alerts_id_read.json`. Fixtures that vary by persona or report kind add a suffix.
- All paths below sit under `/api/v1` (`/health` is also served at the root).

## The fixture world

Every fixture is cut from one small synthetic world, so ids, refs and names match across files.

- **Today** is `DEMO_TODAY = 2026-11-20` (PRD §3). Hero days in §4.7 are relative to this date.
- **GET fixtures** show the seeded state after `POST /demo/reset`, before the live intake.
- **POST fixtures** show the response to that step of the §10 Swagger run order. The intake (step 4) adds case 105 to group 1, and the overlap decision (step 5) confirms group 1 with all 4 cases.
- All names are fictional, including institutions, trusts, complainants and officers. Before the event, check the institution names against AICTE's public approved-institution search (PRD §4.7).

| Entity | Ids used |
| --- | --- |
| Personas (logins) | 1 `senior@aicte.example` (senior_mgmt, `is_admin`), 2 `pgrc.head@aicte.example`, 3 `rb.head@aicte.example`, 4 `ro.central@aicte.example` (region `central`, bureau 5), 5 `intake@aicte.example` |
| Case officers (data only, no login; listed in `/meta.officers`) | 6 Sunita Mishra (PGRC), 7 Vikram Choudhary (RB), 8 Pooja Saxena (RB), 9 Arvind Kulkarni (AB), 10 Sanjay Patil (RO-WRO), 11 Deepak Shrivastava (RO-CRO), 12 Farhan Qureshi (PGRC) |
| Bureaus | 1 RB, 2 PGRC, 3 AB, 4 ACAD, 5–14 the 10 Regional Offices (5 = RO-CRO Central, 14 = RO-WRO Western) |
| Trusts | 1 Vindhya Valley Education Trust, 2 Satpura Technical Education Society, 3 Deccan Plateau Education Society |
| Institutions | `1-4812730561` Vindhya Valley Institute of Engineering & Technology (VVIET, hero), `1-4812730987` Vindhya Valley Institute of Management (trust sibling), `1-4812744105` Narmada Valley College of Engineering, `1-4870215534` Satpura Institute of Technology, `1-4870219908` Sarovar Institute of Technology, `1-4800112233` Mahakaushal Technical University, `1-4800112290` its Department of Pharmacy (`parent_id`), `1-3156608124` Deccan Plateau Institute of Technology (Western region) |
| Hero cases | 101 PGRC/2026/00412, 102 RB/2026/00087, 103 RO-CRO/2026/00133, 104 RB/2026/00079 (trust sibling), 105 PGRC/2026/00519 (live intake, only in POST results) |
| Other cases | 106 PGRC/2026/00398, 107 PGRC/2026/00405 (disposed), 108 RO-CRO/2026/00121 (transferred to RB), 109 AB/2026/00056, 110 PGRC/2026/00377 (reopened, Western), 111 RO-WRO/2026/00204, 112 PGRC/2026/00431 and 113 PGRC/2026/00428 (pending match review), 114 RB/2026/00091 |
| Overlap groups | 1 institution / probable / open (VVIET: 101, 102, 103; plus 105 after intake), 2 trust / possible / open (103, 104), 3 parent / possible / dismissed (108, 109), 4 institution / possible / open (110, 111), 5 institution / possible / open (113, 114; created by the review decision) |
| Match reviews | 1 (case 112, two Bhopal "SIT"s), 2 (case 113, decided in `post_reviews_id_decide.json`) |

## Fixture → endpoint → scenario

"Viewer" is the persona whose token made the request. It matters for scoped data and the `in_scope` flag on case cards.

| Fixture | Endpoint | Status | Viewer | Scenario |
| --- | --- | --- | --- | --- |
| `get_health.json` | GET `/health` | 200 | public | Liveness (no envelope) |
| `post_auth_login_senior.json` | POST `/auth/login` | 200 | public | Senior officer persona card. Request: `requests/post_auth_login.json` with this persona's email |
| `post_auth_login_pgrc_head.json` | POST `/auth/login` | 200 | public | PGRC head persona card |
| `post_auth_login_rb_head.json` | POST `/auth/login` | 200 | public | RB head persona card |
| `post_auth_login_ro_central.json` | POST `/auth/login` | 200 | public | Central RO officer persona card |
| `post_auth_login_intake.json` | POST `/auth/login` | 200 | public | Intake operator persona card |
| `get_users_me_senior.json` | GET `/users/me` | 200 | senior | Role, bureau, region of the current user |
| `get_users_me_pgrc_head.json` | GET `/users/me` | 200 | PGRC head | 〃 |
| `get_users_me_rb_head.json` | GET `/users/me` | 200 | RB head | 〃 |
| `get_users_me_ro_central.json` | GET `/users/me` | 200 | Central RO | 〃 |
| `get_users_me_intake.json` | GET `/users/me` | 200 | intake | 〃 |
| `get_meta.json` | GET `/meta` | 200 | any | Dropdowns: bureaus, regions, categories, statuses, channels, action types, complainant types, dispose outcomes, institution types, officers |
| `get_institutions.json` | GET `/institutions?page=1&limit=20` | 200 | any | Whole registry (8 institutions) |
| `get_institutions_permanent_id.json` | GET `/institutions/{permanent_id}` (`1-4812730561`) | 200 | senior | Institution 360 of VVIET: trust, sibling, cases by bureau, open overlap groups 1 and 2 |
| `post_institutions_resolve.json` | POST `/institutions/resolve` | 200 | intake | Live preview for "vindya valley engg college jabalpur" → `auto`, top-3 candidates with reasons. Request: `requests/post_institutions_resolve.json` |
| `get_cases.json` | GET `/cases?page=1&limit=20` | 200 | senior | All 13 seeded cases, newest first |
| `post_cases.json` | POST `/cases` | 201 | intake | Demo step 4: PGRC/2026/00519 created, resolution `auto`, one probable institution overlap with the exact PS banner. Request: `requests/post_cases.json` |
| `get_cases_id.json` | GET `/cases/{id}` (101) | 200 | PGRC head | Case Detail of PGRC/2026/00412: action history and overlap group 1 with linked RB and RO cards |
| `post_cases_id_actions.json` | POST `/cases/{id}/actions` (103) | 200 | Central RO | `assign` to officer 11: returns the updated case and the new action. Request: `requests/post_cases_id_actions.json` |
| `get_reviews.json` | GET `/reviews?status=pending` | 200 | intake | Match review queue (reviews 1 and 2) |
| `post_reviews_id_decide.json` | POST `/reviews/{id}/decide` (2) | 200 | intake | Picks Narmada Valley College of Engineering: alias saved, case updated, overlap re-run creates group 5. Request: `requests/post_reviews_id_decide.json` |
| `get_overlaps.json` | GET `/overlaps` | 200 | senior | Overlap Center list: groups 1, 2, 4 (open) and 3 (dismissed) |
| `get_overlaps_id.json` | GET `/overlaps/{id}` (1) | 200 | PGRC head | Side-by-side cases, issue clusters, pair reasons (seeded, 3 cases) |
| `post_overlaps_id_decision.json` | POST `/overlaps/{id}/decision` (1) | 200 | PGRC head | Demo step 5: confirm with the PGRC head as coordinator (after intake, 4 cases). Request: `requests/post_overlaps_id_decision.json` |
| `get_alerts.json` | GET `/alerts` | 200 | RB head | Overlap, SLA-breach and reminder alerts, newest first. The Alerts page (#33) groups them by institution and day and sorts by severity |
| `post_alerts_id_read.json` | POST `/alerts/{id}/read` (502) | 200 | RB head | Returns the alert with `is_read: true` |
| `post_alerts_read_all.json` | POST `/alerts/read-all` | 200 | RB head | `{updated}` = the 5 unread alerts in `get_alerts.json` |
| `get_dashboard_summary.json` | GET `/dashboard/summary` | 200 | senior | KPI cards |
| `get_dashboard_workload.json` | GET `/dashboard/workload` | 200 | senior | Open cases per bureau, by status |
| `get_dashboard_ageing.json` | GET `/dashboard/ageing` | 200 | senior | Open cases per ageing bucket (0–7 / 8–14 / 15–21 / 22–45 / 45+) |
| `get_dashboard_institutions.json` | GET `/dashboard/institutions?limit=5` | 200 | senior | Top institutions by open cases |
| `get_reports_bureau.json` | GET `/reports/{kind}` (bureau) `?from=2026-09-01&to=2026-11-20&format=json` | 200 | senior | Bureau-wise counts |
| `get_reports_region.json` | GET `/reports/{kind}` (region) | 200 | senior | Region-wise (unresolved cases have `region: null`) |
| `get_reports_institution.json` | GET `/reports/{kind}` (institution) | 200 | senior | Institution-wise history |
| `get_reports_status.json` | GET `/reports/{kind}` (status) | 200 | senior | Status-wise |
| `get_reports_ageing.json` | GET `/reports/{kind}` (ageing) | 200 | senior | Ageing buckets |
| `get_reports_disposal_rate.json` | GET `/reports/{kind}` (disposal_rate) | 200 | senior | Disposed ÷ received per bureau |
| `get_reports_reopen_rate.json` | GET `/reports/{kind}` (reopen_rate) | 200 | senior | Reopened ÷ disposed at least once (`null` when nothing was disposed) |
| `get_reports_overlaps.json` | GET `/reports/{kind}` (overlaps) | 200 | senior | Groups by level, tier, status |
| `get_reports_periodic.json` | GET `/reports/{kind}` (periodic) `?group_by=month` | 200 | senior | Monthly received / disposed / reopened |
| `post_demo_reset.json` | POST `/demo/reset` | 200 | senior (`is_admin`) | Drop and reseed |

Every report fixture uses `from=2026-09-01&to=2026-11-20`. `format=csv` on `/reports/{kind}` returns `text/csv`. Its header row is the `columns[].label` values and its body is `rows`, so there is no separate CSV fixture.

### Error fixtures (`errors/`)

| Fixture | Endpoint | Status | Viewer | Scenario |
| --- | --- | --- | --- | --- |
| `errors/invalid_transition.json` | POST `/cases/{id}/actions` (101) | 400 | PGRC head | `reopen` on a case that is `under_process` |
| `errors/remarks_required.json` | POST `/cases/{id}/actions` (102) | 400 | RB head | `transfer` without remarks |
| `errors/open_overlap.json` | POST `/cases/{id}/actions` (101) | 409 | PGRC head | Run-order step 7: `dispose` without `confirm_open_overlap`. `details.linked_case_refs` lists the group 1 cases |
| `errors/already_decided.json` | POST `/overlaps/{id}/decision` (3) | 409 | senior | Group 3 was already dismissed |
| `errors/not_found.json` | GET `/cases/{id}` (110) | 404 | Central RO | Run-order step 8: a Western-region case is out of scope, so 404, never 403 |
| `errors/forbidden.json` | POST `/overlaps/{id}/decision` (1) | 403 | Central RO | Group 1 is in scope to read, but `ro_officer` cannot decide overlaps |
| `errors/validation_error.json` | POST `/cases` | 400 | intake | Bad `permanent_id` pattern and a too-short `description` |
| `errors/unauthorized.json` | POST `/auth/login` | 401 | public | Wrong email or password |

### Request bodies (`requests/`)

These are the bodies that produce the POST fixtures above: `requests/post_auth_login.json`, `requests/post_institutions_resolve.json`, `requests/post_cases.json`, `requests/post_cases_id_actions.json`, `requests/post_reviews_id_decide.json` and `requests/post_overlaps_id_decision.json`. `<DEMO_PASSWORD>` is a placeholder; real values never go in git.

## Response shapes

§5 names the key schemas but not every read model. The fixtures pin down the following shapes; #3 (TS types) and #7 (Pydantic) mirror them.

| Shape | Used in | Fields |
| --- | --- | --- |
| `UserRead` | login, `/users/me` | §4.1 `user`: `id, email, name, role, bureau_id, region, is_admin` |
| `LoginOut` | login | `access_token, token_type, user` (tokens are fake, with a non-verifying signature) |
| `CaseRead` | cases, intake, actions, reviews | every §4.1 `case` column, plus derived read-only fields: `institution_name`, `region`, `age_days`, `beyond_sla`, `in_overlap` |
| `CaseDetail` | `GET /cases/{id}` | `case, institution, actions[], overlaps[]` |
| `CaseActionRead` | detail, actions | §4.1 `case_action` + `actor_name` |
| `LinkedCaseCard` | overlaps, Institution 360 | `case_id, case_ref, permanent_id, institution_name, bureau_id, bureau_code, status, category_id, category_code, subject, assigned_officer_id, assigned_officer_name, last_action_type, last_action_at, received_at, in_scope`. No description or complainant name (§4.2 coordination rule). `in_scope` says whether the viewer may open the full case |
| `OverlapSummary` | intake, case detail, review decide, 360 | §5 key schema. `cases` excludes the case the response is about (intake, case detail, review), and lists every member in Institution 360. The Possible-tier banner is "Possible Overlapping Cases – Review Suggested" |
| `OverlapGroupRead` | overlap list, detail | §4.1 `overlap_group` + `anchor_name, banner, coordinator_name, case_count, bureau_codes, top_score` |
| `OverlapDetail` | `GET /overlaps/{id}`, decision | `group, cases[], clusters[], pairs[], reasons[]`. `pairs` follow §4.1 `overlap_pair` |
| `Resolution`, `Candidate`, `CaseIntakeResult` | resolve, intake | §5 key schemas exactly |
| `MatchReviewRead` | reviews | §4.1 `match_review` + the case's `case_ref, raw_institution_text, raw_state, raw_district, subject, received_at, created_at` |
| `ReviewDecision` | `POST /reviews/{id}/decide` | `review, case, alias` (§4.1 `institution_alias`), `overlaps[]` |
| `AlertRead` | alerts | §4.1 `alert` + `case_ref, institution_name`. `dedupe_key` = `type:recipient:entity:date` |
| `Report` | `/reports/{kind}` | `kind, from, to, group_by, generated_at, columns[{key,label}], rows[], totals` |

Enums that §4.1 does not list are fixed by `/meta`: `complainant_type` (`student, parent, faculty, staff, public, anonymous, internal`), `inst_type`, region codes, and `match_status` (§5 decisions plus `reviewed` after a match review is decided).
