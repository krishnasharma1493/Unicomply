# Unicomply demo script

One story, 4:30 at most. A fourth complaint about Vindhya Valley IET arrives misspelt. Unicomply links it to the right institution in under two seconds, and PGRC and RB coordinate instead of acting blind.

Two roles. The **Driver** clicks. The **Narrator** talks. A solo presenter does both. Never debug on stage: if a step breaks, the Narrator keeps talking and the Driver uses that step's fallback within 10 seconds.

Companion files: [`hero_intake.txt`](hero_intake.txt) (the exact values to paste), [`eval_results.md`](eval_results.md) (the accuracy numbers for step 9).

## Before you go on

State the script assumes (the numbers below were checked against the full seed on 2026-11-20):

| Item | Value |
| --- | --- |
| Data | Full synthetic seed, loaded by `python -m app.seed --reset` or Admin → reset, with `DEMO_TODAY=2026-11-20` |
| Dashboard before the live intake | 1,500 cases, 752 pending, 635 beyond SLA, 39 open overlaps |
| Hero case | PGRC/2026/00412: "Day 19 of 21" (due 2026-11-22), in an overlap |
| Hero intake result | New case `PGRC/2026/00715` in PGRC, three linked cases (PGRC/2026/00412, RB/2026/00087, RO-CRO/2026/00133). With the real model: red **Probable** banner, scores 0.70 / 0.64 / 0.61. With the offline TF-IDF fallback: amber **Possible** banner, scores 0.68 / 0.62 / 0.56 (see F-2) |
| Embeddings | `EMBEDDINGS_MODE=model` with the model **already downloaded** (`paraphrase-multilingual-MiniLM-L12-v2`; run the hero once with network before the event). If the model cannot load, the app falls back to TF-IDF by itself and logs one line; the demo still works but shows the Possible tier |
| Seed | Always the **full** seed (`SEED_SET=full`, the default). Never demo on the tiny seed: with only 10 institutions the hero ranks Narmada Valley above Vindhya Valley |

Checklist, in order:

- [ ] Reset the demo right before presenting, then run the hero intake once to warm the index, then reset again. Always reset after a rehearsal: a confirmed overlap stays confirmed.
- [ ] `/health` is green. Backend and frontend are running. Browser: fresh window, zoom 125–150%, bookmarks hidden, notifications off.
- [ ] **Check the hero intake resolves on its own.** On Case Intake, paste the institution name from `hero_intake.txt`. The top candidate must be *Vindhya Valley Institute of Engineering & Technology* with no "needs review" label. If it asks for review, use fallback **F-1** below before going on stage. Then submit the intake once and check the banner is the red **Potential Overlapping Cases – Coordination Required**. If it is the amber **Possible Overlapping Cases – Review Suggested**, the model did not load (offline fallback): fix it, or rehearse with **F-2**.
- [ ] Log in once as each of the four personas used below (intake, PGRC head, RB head, senior officer) and check the persona switcher works.
- [ ] `hero_intake.txt` is open in a text editor, next to the browser.
- [ ] The accuracy numbers on the step 9 slide are copied from `eval_results.md` (test split).
- [ ] Backup video is open and paused. Phone hotspot ready.

## Script

Personas (all one click on the login page or in the header switcher): **Senior officer** Dr. Meera Raghavan (`senior@aicte.example`), **PGRC head** Anil Deshmukh (`pgrc.head@aicte.example`), **RB head** Kavita Rao (`rb.head@aicte.example`), **Intake operator** (`intake@aicte.example`).

| # | Time | Driver (on screen) | Narrator says (adapt, keep it short) | If it breaks |
| --- | --- | --- | --- | --- |
| 1 | 0:00–0:30 | Problem slide: one institution, four complaints, three units, no shared view. | "Today the same college can face a fee-refund case in PGRC, a show-cause notice from the Regulation Bureau and a Regional Office complaint. None of them knows about the others, so AICTE can act twice, or contradict itself." | None needed. |
| 2 | 0:30–0:55 | Log in as the **Senior officer**. Dashboard opens. Point at the *beyond SLA* and *open overlaps* cards, then the bureau workload chart. | "One screen for all of AICTE: what is pending, what is past the 21-day limit, and where the work sits. This card is the new part: overlaps, cases about the same institution handled in different places." | Show the Dashboard screenshot slide. |
| 3 | 0:55–1:20 | Switch persona to **Intake operator** → **Case Intake**. Paste the values from `hero_intake.txt`, institution name first. The candidates panel fills. | "A parent emails us. The name is misspelt, abbreviated, there is no ID. Unicomply expands the short forms, checks the district, finds the right Permanent ID and tells us why." | F-1 (use the Review queue), or open the seeded hero case PGRC/2026/00412 and continue from step 4. |
| 4 | 1:20–2:00 | Submit. The result panel shows `PGRC/2026/00715` and the red **Potential Overlapping Cases – Coordination Required** banner with three linked cases (PGRC, RB, Central RO). Read two reasons aloud, for example *Same institution 1-4812730561* and *Both about certificate withheld*. (Amber **Possible Overlapping Cases – Review Suggested** instead: see F-2.) Optional, 10 seconds: open **Institutions** in the sidebar, search `Vindhya`, and show the **Institution 360** page with the three bureaus' cases side by side. | "Three units are already acting on this college. Without this, PGRC might close a refund while RB is issuing a show-cause. And every flag shows its reasons: same institution, related issues." | Open **Overlap Center** → the Vindhya Valley group. Failing that, play the backup video from 1:20. |
| 5 | 2:00–2:25 | Switch to **PGRC head**. **Cases** → type `00412` in the search box → open **PGRC/2026/00412**. Show the SLA badge *Day 19 of 21* and the action timeline. Choose **Dispose** → the open-overlap warning appears. Close it. | "Full history: who did what, and when. And nobody can quietly close a case another unit is still working on." | Open the case from the banner's linked-case card instead. |
| 6 | 2:25–3:00 | From that case, open the overlap group (**Overlap Center** works too): side-by-side columns → **Confirm overlap** → **Choose a coordinator**: *Sunita Mishra* (a PGRC case officer) → confirm. | "An official always decides. Confirming names a coordinator and alerts every unit involved." | Skip to step 7. |
| 7 | 3:00–3:20 | Switch to **RB head**. The bell shows a new alert, *Overlap confirmed*. Open it: the overlap page lists all linked cases and the coordinator. (If real-time N2 is built, show it arriving in a second window instead.) | "RB sees it straight away, with the coordinator's name." | Open the **Alerts** page; the overlap alerts are there. |
| 8 | 3:20–3:45 | Switch to **Senior officer** → **Reports** → *Bureau* and *Ageing* → **Download CSV**. | "Bureau, region, institution, ageing, disposal rate and reopen rate, monthly or quarterly, and it downloads as a CSV." | Reports slide. |
| 9 | 3:45–4:10 | Accuracy slide from `eval_results.md`, then the architecture slide. | "We tested on synthetic data with known answers: precision, recall and F1 on cases the system never saw during tuning. Measured, not claimed. And it runs fully offline." | Slide only. |
| 10 | 4:10–4:30 | Impact and next steps slide, then the team. | "One source of truth for every institution. Next: CPGRAMS integration, Parichay sign-in, Postgres with pgvector at national scale." | None needed. |

### Fallbacks

- **F-1, the hero intake asks for review instead of linking.** Say "this is the uncertain case, so it goes to a person" and open **Match Review** (`/reviews`). Pick *Vindhya Valley Institute of Engineering & Technology*. The spelling is saved as an alias and overlap detection runs, so the banner appears. The story is the same, it takes about 15 seconds longer, and the next time the same spelling links automatically.
- **Backend down.** Play the backup video from the timestamp of the step you are on. Never restart on stage.
- **F-2, the banner is amber (Possible), not red.** This is the offline TF-IDF fallback; the engine, the linked cases and the reasons are the same, and only the tier differs. Say: "At this confidence it suggests a review rather than demanding coordination. Either way, an official decides." Steps 5 to 7 are unchanged, except that only the three involved heads are alerted and senior management is not.
- **Wrong SLA day.** `DEMO_TODAY` is not pinned. Do not present until it is, and reset.
- **Anything else.** Skip to the next step, using that step's "If it breaks" cell.

## Timing

The step windows above are the budget (PRD §10A): 4:30 in total. The Narrator lines add up to about 240 words, which is roughly 1:40 of speech at 150 words a minute, so every step's talking fits its window. What fills the rest is the Driver's clicking, and only a rehearsal can measure that (#57 replaces these budgets with measured times).

| Plan | What changes | Total |
| --- | --- | --- |
| Full script | Windows as in the table | 4:30 |
| Without step 7 | Drop the RB-head step (also the first thing to cut if you are running long) | 4:10 |
| 3:30 version | Drop step 7 (−20 s); step 6 to 20 s (−15 s: confirm, skip the side-by-side tour); step 4 to 30 s (−10 s: skip the Institution 360 detour); step 9 to 15 s (−10 s: accuracy slide only); step 5 to 20 s (−5 s: skip the timeline) | 3:30 |

## Where each PS Key Feature is shown

| PS Key Feature (as mapped in PRD §1A) | Step or screen |
| --- | --- |
| 1. Institution registry and Institution 360 | Step 4 (optional detour via the sidebar); screen **Institutions** |
| 2. Case intake and tracking fields | Steps 3, 4 and 5 |
| 3. Cross-bureau overlap detection | Steps 3, 4 and 6; screens **Overlap Center** and **Match Review** |
| 4. Dashboard | Step 2 |
| 5. Workflow and action history | Steps 5 and 6 |
| 6. Search and filters | Step 5 (search `00412`); screen **Cases** |
| 7. Alerts and SLA | Step 7 (alert) and step 5 (SLA badge) |
| 8. Reports and CSV | Step 8 |

## Rubric mapping

The official rubric is not out yet. **TODO: paste the official SIH judging criteria here and check that each has a step.** Until then, by criterion type:

| Criterion | Where it is proved |
| --- | --- |
| Innovation and novelty | Step 4: the cross-bureau overlap with reasons |
| Technical complexity | Steps 3, 4 and 6: name resolution, location veto, tiered overlap scoring |
| Feasibility and completeness against the problem statement | Steps 2, 5 and 8, with the table above covering features 1–8 |
| Rigor | Step 9: precision and recall on held-out synthetic data |
| Impact and scalability | Step 10 |

## Likely judge questions

| Question | One-sentence answer |
| --- | --- |
| Is this real AICTE data? | No, it is fully synthetic with planted ground truth, so we can measure accuracy; it plugs into real feeds through the intake API. |
| Why would overlap happen if students pick only one cell? | Overlap comes from many complainants, many channels, the Regulation Bureau acting on its own, and name variants, not from the student's choice. |
| How is this different from CPGRAMS? | CPGRAMS routes grievances across ministries; Unicomply links cases about the same institution across AICTE's own bureaus and Regional Offices, including regulatory actions that are not complaints. |
| What if the match is wrong? | Low-confidence matches go to a person, a location check rules out impossible matches, every flag shows its reasons, and only an official can confirm a link. |
| What about false alarms? | Alerts are tiered and grouped per institution per day, and a dismissed pair never alerts again. |
| How accurate is it? | Read the figures from `eval_results.md`, test split: precision, recall and F1 are always quoted together, and we say where it falls short. |
| Does it need the internet? | No: the offline text-similarity mode gives the same demo, and there are no external calls at run time. |
| How does it scale to all institutions in India? | The same design on PostgreSQL with trigram search and pgvector; blocking by state keeps the comparisons small. |
| How do officials log in? | In production through Parichay or government SSO, with MFA for senior officials; the demo switches personas so you can see each unit's view. |
