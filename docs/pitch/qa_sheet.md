# Judge Q&A sheet

One sentence to say, the number behind it, and where to show it. Numbers are from [`ppt/facts.md`](ppt/facts.md) (measured on `main`, TF-IDF mode, demo date 2026-11-20) and [`eval_results.md`](eval_results.md) (test split).

| Question | Answer | Evidence |
| --- | --- | --- |
| Is this real AICTE data? | The 3,751 institutions, with their Permanent IDs, are AICTE's own approved list for 2024-25. The 1,500 cases, complaint text, complainants and officers are made up, with planted overlaps, so we can measure accuracy. Real feeds plug into the same intake API. | `backend/seed_data/aicte_raw/SOURCE.md`; demo script, "Before you go on" |
| Why would overlap happen if a student picks only one cell? | It comes from several complainants, several channels, RB acting on its own, and the same college written many ways. It does not depend on the student's choice. | PRD §0 |
| How is this different from CPGRAMS? | CPGRAMS routes grievances between ministries. Unicomply links cases about one institution across AICTE's own bureaus and Regional Offices, including regulatory actions that are not complaints. | PRD §0 |
| What if the match is wrong? | Doubtful names go to a person. A different district blocks the link. Every link shows its reasons, and only an official confirms an overlap. On the test split, 655 of 656 automatic links were right, 38 of 769 cases went to the review queue, and 0 of 9 same-name colleges in another state were linked. | `eval_results.md`, step 3 and the Match Review page |
| What about false alarms? | Alerts are tiered, deduplicated per person, case and day, and a dismissed pair never alerts again. All 15 Probable flags in the test split were real overlaps. Counting every flagged pair, 23 of 70 matched a planted overlap, so Possible flags are the noisy ones and a head decides. | `eval_results.md`: Probable 15/15, all flagged 23/70 |
| Your overlap recall is 0.72. The target was 0.90. | Correct, and it is stated on our own slide. The misses start at names that never resolved: acronym-only names resolve at 0.52 and a wrong state at 0.00. When the true institution is given, the engine finds all 32 of 32 planted pairs. The fix is in resolution, not scoring. | `eval_results.md`, "Overlap pair recall by planted level" and "Resolution by noise type" |
| Why not a large language model? | The matching has to be explainable, repeatable and work offline. Embeddings find candidates, plain rules decide, and every flag lists its reasons. Weights and thresholds sit in one file and were tuned on the dev split only. | `backend/seed_data/thresholds.json`; `backend/app/matching/README.md` |
| Does it need internet or a GPU? | No. If the embedding model is missing, the engine falls back to TF-IDF by itself and logs one line. Intake took 0.095 s at the median over 10 runs on a laptop. | `facts.md`, "Speed and tests" |
| Why 21 days? | The DARPG office memorandum of 23 Aug 2024 says grievances are ordinarily resolved within 21 days and allows an interim reply. The clock warns from day 17. | OM F.No. S-15/21/2021-(PG)-DARPG(e-7085), para 3.1.1 and 3.1.2 |
| How does it scale to all institutions? | The same design on PostgreSQL with pg_trgm and pgvector. Blocking by state keeps the number of comparisons small. | PRD §1 and §12A |
| How do officials log in? | In production, through Parichay or government SSO with MFA. The demo switches between five personas so you can see each unit's view. | PRD §12A |
| What keeps one bureau from seeing another's complaint text? | Every case query is scoped by role and bureau. Another unit's case appears only as a summary card with no description or complainant name. | PRD §4.2; `backend/app/core/scope.py` |
| How was it tested? | 604 backend and 369 frontend tests pass on `main`. The engine is scored on synthetic data with known answers, split by whole institution family so nothing leaks between tuning and reporting. | `facts.md` |
| What is not built? | Real CPGRAMS and email ingestion, SSO, the full state-wide registry beyond six states, OCR of scanned letters, and a security audit before real complainant data. | PRD §12A |

## Research behind the design (each source was opened and read)

- Kang et al., Science Editing 2026, [doi 10.6087/kcse.396](https://doi.org/10.6087/kcse.396): exact match, then fuzzy, with a location check reached precision 0.97 and recall 0.93; unconstrained fuzzy matching gave 8,314 false positives.
- Reimers and Gurevych, EMNLP-IJCNLP 2019, [aclanthology.org/D19-1410](https://aclanthology.org/D19-1410): sentence embeddings make similarity search practical.
- Mamun et al., PLoS ONE 2016, [doi 10.1371/journal.pone.0154446](https://doi.org/10.1371/journal.pone.0154446): complete linkage avoids chaining unrelated records into one group, which is why a group here is anchored on a registry key.
- Lam et al., IJPDS 2024, [doi 10.23889/ijpds.v9i1.2389](https://doi.org/10.23889/ijpds.v9i1.2389): synthetic data with replicated error patterns gave accurate linkage-quality estimates.
