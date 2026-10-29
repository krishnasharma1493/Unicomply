# Facts behind the deck

Every number on the slides, where it comes from, and when it was measured. All of it was measured on `origin/main` at commit `2dc0043` ("Clean stray characters from real institution names (#135)") on 2026-10-29, with the demo date set to 2026-11-20 (`DEMO_TODAY`). The matching mode was `EMBEDDINGS_MODE=tfidf`, the offline fallback. Older repo documents (for example the first demo script) quote different numbers: do not copy from them.

## Dataset

| Number on slide | Value | How it was measured |
|---|---|---|
| Institutions in the registry | 3,751 | `GET /api/v1/institutions?limit=1`, `pagination.total`; matches `seed_data/aicte_registry.json` (3,751 institutions, 46 trusts) |
| Registry coverage | six states: Delhi 64, Gujarat 353, Madhya Pradesh 461, Maharashtra 1,078, Tamil Nadu 978, Uttar Pradesh 817 | `aicte_registry.json`, key `by_state` |
| Universities | 70 | `aicte_registry.json`, key `by_type` |
| Registry source | AICTE Approved Institutes, academic year 2024-25 | `backend/seed_data/aicte_raw/SOURCE.md` |
| Cases | 1,500, all fabricated | `GET /dashboard/summary` as the senior officer, after `POST /demo/reset` |
| Pending / beyond the 21-day limit | 740 / 630 | same call |
| Open overlaps | 39 (25 Probable, 14 Possible) | `GET /overlaps?tier=...&status=open`, `pagination.total`, before any live intake |
| Pending match reviews | 22 | `GET /reviews?status=pending` |
| Units | 14 (RB, PGRC, AB, ACAD and 10 Regional Offices) | `GET /meta`, `bureaus` |
| Intake channels | 7 (cpgrams, aicte_portal, email, letter, ro_referral, rb_suo_motu, inspection) | `SourceChannel` in `app/core/enums.py` |
| Database tables | 14 | `table=True` models under `app/modules/*/models.py` |
| Open cases by unit (slide 5 chart) | 740 open: PGRC 319, RB 213, AB 67, ACAD 66, RO-WRO 25, RO-SRO 17, RO-NRO 15, RO-CRO 13, RO-NWRO 4, RO-NERO 1 | `GET /dashboard/workload` after a reset |

## Accuracy (test split, synthetic data with planted ground truth)

Command: `python -m app.eval --split test --mode tfidf` (rewrites `docs/pitch/eval_results.md`; it was unchanged on `origin/main`, so the checked-in file is current).

| Number on slide | Value |
|---|---|
| Test cases | 769 |
| Resolution precision | 0.998 (655 of 656 automatic links correct) |
| Resolution recall / F1 | 0.852 / 0.919 |
| Review queue | 38 of 769 cases (0.049) |
| Overlap pair recall, end to end | 0.719 (23 of 32): below the 0.90 target |
| Overlap pair recall, true institution given | 32 of 32 |
| Probable precision | 1.000 (15 of 15) |
| All flagged pairs that match a planted overlap | 23 of 70 |
| Acronym-only recall | 0.520 |
| Wrong state | recall 0.000 on 14 cases |
| Hard negatives wrongly linked | 0 of 9 (same name, other state) and 0 of 5 (disposed long ago) |

## Settings (`backend/seed_data/thresholds.json`)

Auto-link 0.50, review 0.45, margin 0.05; Probable 0.50, Possible 0.45; resolution weights fuzzy 0.45 / semantic 0.25 / acronym 0.15 / location 0.15; pair weights text 0.60 / category 0.25 / time 0.15 with a 60-day decay; level weights institution 1.0 / parent 0.8 / trust 0.6; overlap window 180 days; SLA 21 days with a warning from day 17; idle reminder after 7 days (`.env.example`).

## Speed and tests

| Number on slide | Value | How it was measured |
|---|---|---|
| Intake time | median 0.095 s (min 0.054 s, max 0.120 s) over 10 registrations | `POST /api/v1/cases` with the hero text against the running backend, `curl -w %{time_total}`; laptop, TF-IDF mode. Candidate preview alone: about 5 ms |
| Backend tests | 604 passed, 3 skipped | `pytest` in `backend/` |
| Frontend tests | 369 passed in 24 files | `npx vitest run` in `frontend/` |

## The hero path (not printed on a slide, but this is what the demo shows)

Input "maharaja agrsen institute of technology delhi", state Delhi: resolves automatically to Maharaja Agrasen Institute of Technology (1-43655981521) at score 0.68, with "Name 85% similar", "State Delhi matches" and "Description/name context similarity 0.72". Registering the case creates PGRC/2026/00698 and links PGRC/2026/00412, RB/2026/00087 and RO-NWRO/2026/00133. In TF-IDF mode the group is **Possible**, not Probable. The real embedding model was not run, so the deck makes no claim about the Probable banner.

## References checked

| Slide reference | Checked |
|---|---|
| Kang et al., Science Editing 2026;13(1):46-50, doi 10.6087/kcse.396 | Opened. Two-stage registry-anchored matching: precision 0.97, recall 0.93, F1 0.95. Exact match plus geographic validation alone had precision 0.98. Unconstrained fuzzy matching produced 8,314 false positives. |
| Reimers and Gurevych, EMNLP-IJCNLP 2019, aclanthology.org/D19-1410 | Opened. |
| Mamun et al., PLoS ONE 2016, doi 10.1371/journal.pone.0154446 | Opened. Complete linkage avoids the chaining problem of single linkage. |
| Lam et al., IJPDS 2024, doi 10.23889/ijpds.v9i1.2389 | Opened. Synthetic data gave accurate estimates of linkage quality metrics. |
| DARPG office memorandum, 23 Aug 2024 (F.No. S-15/21/2021-(PG)-DARPG(e-7085)) | Opened the PDF from pgportal.gov.in and read para 3.1.1: grievances are to be resolved within 21 days; 3.1.2 covers an interim reply. |
| github.com/krishnasharma1493/Unicomply | Opened; the repository is public. |

Not used on the slides because the publisher blocks automated checks and the claims could not be confirmed: ZeroER (ACM 10.1145/3318464.3389743), Christen et al. 2024 (ACM 10.1145/3735511) and Hand and Christen 2017 (Springer 10.1007/s11222-017-9746-6). Check them in a browser before adding them.

## Decisions and known gaps

- **Six slides, not seven.** The official SIH template says at most six, including the title, saved as PDF. The AstraX deck's seventh slide (User Flow) was dropped; the GitHub link moved to Research and References.
- **Map replaced.** The India dot map on the Impact slide was fire-detection data. It is now a chart of open cases by unit. The five callout lines that pointed into the map were removed.
- **Environmental benefit** is stated as an intended effect and marked as not measured.
- **Theme and ID.** Theme "Smart Automation" and ID "SIH26264" were typed by you; the repo does not record them.
- **Team.** Team ID SIH26-DU-T07, name AstraX and the AstraX logo were kept, as you said it is the same team.
- **Model mode.** All results are from TF-IDF mode. With the embedding model the scores differ.
