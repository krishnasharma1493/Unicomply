# Unicomply deck: final slide copy

Generated from the build script. Box names are the shape names inside the template, so a text swap can be redone by hand. Numbers are traced in `facts.md`.

## Slide 1: Title page

- `TextBox 9`: Problem Statement ID: SIH26264 / Problem Statement Title: Integrated Dashboard for Monitoring and Tracking Institution-Related Complaint Cases Across AICTE Bureaus/Cells / Theme: Smart Automation / PS Category: Software / Team ID: SIH26-DU-T07 / Team Name: AstraX

## Slide 2: Idea (Proposed Solution, Key Innovations, Actionable Intelligence, Addressing the Problem)

- `TextBox 65`: UNICOMPLY / ONE VIEW OF EVERY INSTITUTION COMPLAINT
- `TextBox 46`: Complaint Intake and Tracking: / One register for cases from CPGRAMS, email, letters and Regional Offices, each with a 21-day SLA clock.
- `TextBox 70`: Institution Resolution:  / Turns a misspelt name such as “agrsen” into the right Permanent ID from a registry of 3,751 institutions.
- `TextBox 71`: Overlap Detection: / Finds open cases on the same institution, university or trust in different units and lists the reasons.
- `TextBox 72`: Officer Decision and Alerts:  / Heads confirm or dismiss each overlap and name a coordinator; alerts go to the units involved.
- `TextBox 67`: Registry-Anchored Matching: Exact ID first, then fuzzy; another district blocks the link.
- `TextBox 68`: Reasons and an Offline Mode: Every flag lists its reasons in words. A TF-IDF fallback runs with no network and no model download.
- `TextBox 77`: Tiered Alerts: Probable goes to heads and senior officers, Possible to heads.
- `TextBox 78`: SLA Alerts: Warning on day 17 of 21, a breach alert after, and a 7-day idle reminder.
- `TextBox 73`: No Blind Spots: The same college can face a fee case in PGRC and a show-cause notice from RB. Unicomply puts both on one screen.
- `TextBox 74`: Joined-Up Action: Heads see who else is acting, so two units do not repeat the work or issue conflicting decisions.

## Slide 3: Technical Approach

- `TextBox 5`: Public registry, synthetic cases
- `TextBox 12`: Backend · Python, FastAPI · :8000
- `TextBox 21`: Engine · RapidFuzz, TF-IDF, embeddings
- `TextBox 28`: Engine · scoring in pure Python
- `TextBox 35`: Backend · rules, job loop
- `TextBox 44`: SQLite · React 19 · :5173
- `TextBox 52`: Complaint channels
- `TextBox 53`: Seven intake routes
- `TextBox 54`: Seven channels, from CPGRAMS and email to inspections / 1,500 cases, all fabricated / Typos, short forms, missing districts / Ground truth kept for scoring / Seed 26264, reproducible
- `TextBox 61`: AICTE registry
- `TextBox 62`: Approved list, 2024-25
- `TextBox 63`: 3,751 institutions in six states / 46 trusts and 70 universities / Real names and Permanent IDs
- `TextBox 75`: Register the case
- `TextBox 76`: cases/router.py · workflow.py
- `TextBox 77`: One form, validated before it is sent / Routed to the category’s bureau by default / case_ref per bureau and year; SLA due date set / Case and overlap check in one transaction
- `TextBox 89`: Normalize the text
- `TextBox 90`: normalize.py · abbreviations.json
- `TextBox 91`: Case, punctuation and filler words removed / Short forms expanded: ENGG to ENGINEERING / Acronym built for every registry name / District and Permanent ID read from the text
- `TextBox 104`: Resolve the institution
- `TextBox 105`: resolve.py · index.py
- `TextBox 106`: Block by state, then try an exact ID, name or alias match / Score the rest: fuzzy 0.45, semantic 0.25, acronym 0.15, location 0.15 / A different district vetoes the link
- `TextBox 118`: Score each pair
- `TextBox 119`: overlap.py · index.py
- `TextBox 120`: Candidates: open cases in a 180-day window / Text similarity 0.60, category 0.25, time 0.15 / Time decays over 60 days / Level: institution 1.0, parent 0.8, trust 0.6 / Reasons written for every pair
- `TextBox 132`: Cluster and tier
- `TextBox 133`: overlap.py
- `TextBox 134`: Complete linkage groups cases by issue, with no chaining / Probable from 0.50, Possible from 0.45
- `TextBox 148`: Decide and learn
- `TextBox 149`: engine/service.py
- `TextBox 150`: Auto-link at 0.50 if 0.05 ahead of the runner-up / Otherwise: review queue, or no match / A reviewer’s pick is saved as an alias / The same spelling then resolves on its own / A dismissed pair never raises an alert again
- `TextBox 157`: How it was tuned
- `TextBox 158`: tune.py · eval.py
- `TextBox 159`: Synthetic data, seed 26264 / Tuned on the dev split only / Test split: F1 0.919, precision 0.998, recall 0.852
- `TextBox 171`: Raise the alerts
- `TextBox 172`: alerts/service.py
- `TextBox 173`: Probable: critical alert to heads and senior officers / Possible: warning to the involved heads / SLA warning on day 17 of 21, breach after / No repeat alert per person, case and day
- `TextBox 180`: Overlap lifecycle
- `TextBox 181`: overlaps/service.py
- `TextBox 182`: open → confirmed or dismissed → resolved / Confirming names a coordinator; dismissing needs a remark / Resolves itself when every case is disposed
- `TextBox 190`: SQLite
- `TextBox 191`: demo database, 14 tables
- `TextBox 192`: case / case_action / institution / trust
- `TextBox 193`: overlap_group / overlap_pair / overlap_link / match_review
- `TextBox 194`: PostgreSQL with pgvector is the production path
- `TextBox 206`: Serve the app
- `TextBox 207`: main.py · pages/
- `TextBox 208`: REST /api/v1 with a {success, data, error} envelope / Every case query is scoped by role and bureau / Today queue, case split view, overlap lanes / Evidence table and the resolution line / Command bar: Ctrl K finds a case or institution / Ant Design, TanStack Query
- `TextBox 228`: Overlap Levels  and tiers
- `TextBox 233`: Institution
- `TextBox 236`: Same Permanent ID in different units
- `TextBox 242`: Parent university
- `TextBox 245`: A university and its departments
- `TextBox 251`: Trust
- `TextBox 254`: Institutions run by one trust
- `TextBox 260`: Probable
- `TextBox 263`: Pair score ≥ 0.50: coordinate
- `TextBox 269`: Possible
- `TextBox 272`: Pair score ≥ 0.45: review
- `TextBox 278`: Dismissed
- `TextBox 281`: Never raised again for that pair
- `TextBox 282`: Scoring Weights  all in thresholds.json
- `TextBox 283`: Resolution  and thresholds
- `TextBox 284`: fuzzy name 0.45 / semantic text 0.25 / acronym 0.15 / location 0.15 / auto-link at 0.50 / send to review at 0.45 / runner-up margin 0.05 / Probable at 0.50 / Possible at 0.45 / window 180 days
- `TextBox 285`: Pair score  and level
- `TextBox 286`: text 0.60 · category 0.25 / time 0.15, decay 60 days / institution level 1.0 / parent 0.8 · trust 0.6
- `TextBox 291`: Tuned once on the dev split, then frozen. The test split is only reported.
- `TextBox 292`: Current System Metrics  demo data, 20 Nov 2026
- `TextBox 297`: 3,751
- `TextBox 300`: AICTE institutions in the registry
- `TextBox 305`: 1,500
- `TextBox 308`: cases in the demo world
- `TextBox 313`: 39
- `TextBox 316`: open overlaps, 25 Probable
- `TextBox 321`: 22
- `TextBox 324`: uncertain matches to review
- `TextBox 329`: 604
- `TextBox 332`: backend tests passing
- `TextBox 333`: Known Limitations  from the test split
- `TextBox 336`: Overlap recall is 0.72, not 0.90. / Misses start at names that never resolved.
- `TextBox 339`: Acronym-only names resolve at 0.52. / Names like VVIET have little else to match on.
- `TextBox 342`: Wrong state means no link. / The state blocks the search: 0 of 14 linked.
- `TextBox 345`: The cases are fabricated. / Institutions are real; cases are not.

## Slide 4: Feasibility and Viability

- `TextBox 16`: 0.1 s
- `TextBox 17`: Intake time
- `TextBox 18`: Median of 10 intakes into a 1,500-case database. Laptop, offline mode.
- `TextBox 24`: INTAKE
- `TextBox 28`: Names arrive misspelt or shortened, often with no state or ID.
- `TextBox 32`: Expand short forms, correct spelling against the registry, and send doubtful names to a review queue.
- `TextBox 33`: 3,751
- `TextBox 34`: Institutions
- `TextBox 35`: AICTE-approved institutions in six states, with Permanent IDs and trusts.
- `TextBox 41`: REGISTRY
- `TextBox 45`: The public list has no state column; states came from its row blocks.
- `TextBox 49`: Get the full master list from AICTE and sync it nightly by Permanent ID, then cover every state.
- `TextBox 50`: 0.998
- `TextBox 51`: Link precision
- `TextBox 52`: 655 of 656 automatic links were right on the test split. Recall is 0.852.
- `TextBox 58`: RESOLUTION
- `TextBox 62`: Acronyms resolve at 0.52; a wrong state blocks the link.
- `TextBox 66`: Review choices become aliases. Next: look beyond the stated state and keep a register of acronyms.
- `TextBox 67`: 23 / 32
- `TextBox 68`: Pairs found
- `TextBox 69`: Planted pairs found, test split. With the right institution given: 32 of 32.
- `TextBox 75`: OVERLAP
- `TextBox 79`: Misses start at names that never resolved, not at scoring.
- `TextBox 83`: Fix resolution first. Probable precision is already 15 of 15, so hold the thresholds and re-run the eval after each change.
- `TextBox 84`: 39
- `TextBox 85`: Open overlaps
- `TextBox 86`: Demo data: 25 Probable, 14 Possible. Each waits for a head.
- `TextBox 92`: ALERT
- `TextBox 96`: Flags are noisy: 23 of 70 flagged pairs were planted overlaps.
- `TextBox 100`: Tier and deduplicate alerts. A head confirms or dismisses, and a dismissed pair stays out.
- `TextBox 101`: 604
- `TextBox 102`: Backend tests
- `TextBox 103`: Passing on main, plus 369 frontend tests. It runs in a browser; nothing to install.
- `TextBox 109`: OFFICER
- `TextBox 113`: Officers have set routines and may not take up a new tool.
- `TextBox 117`: Start with one bureau. Today shows each person’s own queue, and Ctrl K jumps to any case.
- `TextBox 120`: No paid services: the registry is AICTE’s public list, and matching runs on a laptop with no network.    / Small to run: one FastAPI service, one SQLite file and one React app; PostgreSQL is the production path.    / Ready for real data: connectors post to the same intake API, and CPGRAMS numbers stay as the external reference.   

## Slide 5: Impacts and Benefits

- `TextBox 7`: 1,500 cases across 14 AICTE units in the demo data; 3,751 real institutions in the registry
- `TextBox 10`: 39 open overlaps, 25 Probable
- `TextBox 13`: Senior management
- `TextBox 14`: All 14 units
- `TextBox 15`: 630
- `TextBox 18`: open cases past the 21-day limit
- `TextBox 19`: Of 1,500 cases, 740 are pending. Every KPI opens the list behind it.
- `TextBox 27`: Bureau heads
- `TextBox 28`: PGRC, RB, AB and ACAD
- `TextBox 29`: 39
- `TextBox 32`: overlaps waiting for a decision
- `TextBox 33`: Each lists its cases and reasons. Confirming names a coordinator and alerts the other heads.
- `TextBox 41`: Regional Offices
- `TextBox 42`: One office per region
- `TextBox 43`: 10
- `TextBox 46`: Regional Offices in the system
- `TextBox 47`: Each sees the cases of institutions in its region. Other units’ cases show as summary cards.
- `TextBox 55`: Intake operators
- `TextBox 56`: Intake desk and match review
- `TextBox 57`: 22
- `TextBox 60`: uncertain matches to review
- `TextBox 61`: The engine shows ranked candidates with reasons. The pick is saved, so the same spelling resolves next time.
- `TextBox 69`: Institutions
- `TextBox 70`: AICTE-approved, six states
- `TextBox 71`: 3,751
- `TextBox 74`: institutions with Permanent IDs
- `TextBox 75`: Each institution page lists its cases across every bureau, so one college gets one coordinated response.
- `TextBox 85`: Students and parents get one answer from AICTE, not two that contradict. The 21-day clock and the day-17 warning keep cases from sitting unseen.
- `TextBox 90`: Built on open tools and AICTE’s public list, with no licences or hardware to buy. Heads start from one ranked queue instead of several registers.
- `TextBox 95`: No new hardware. If two units learn of each other’s case early, one site visit can replace two. We have not measured this.
- `TextBox 100`: Every flag lists its reasons. A head confirms or dismisses, and each action is logged. Unmatched names stay unlinked.

## Slide 6: Research and References

- `TextBox 42`: Registry-anchored matching / Exact match, then fuzzy, with a location check: precision 0.97 (Kang et al., 2026)
- `TextBox 43`: Sentence embeddings / Sentence-BERT makes similarity search practical (Reimers and Gurevych, 2019)
- `TextBox 44`: Complete-linkage clustering / Stops unrelated records chaining into one group (Mamun et al., 2016)
- `TextBox 45`: Synthetic test data / Synthetic data with replicated errors estimated linkage quality well (Lam et al., 2024)
- `TextBox 46`: Kang et al., 2026 / Registry-anchored name matching / doi.org/10.6087/kcse.396
- `TextBox 47`: Reimers and Gurevych, 2019 / Sentence-BERT, EMNLP-IJCNLP / aclanthology.org/D19-1410
- `TextBox 48`: CPGRAMS guidelines / DARPG memo, 23 Aug 2024: 21 days / pgportal.gov.in
- `TextBox 50`: Unicomply / Source code and documentation / github.com/krishnasharma1493/Unicomply


## Layout notes

- The font is Arial throughout (the template's Helvetica Now is not available in Google Slides or most PowerPoint installs, and the substitute was wider, which pushed text out of its boxes).
- Slide titles and the section headings are widened to one line; the slide 5 chart was redrawn with a left margin and no footnote.
- Checked by rendering all six slides and measuring each text box against its container.
