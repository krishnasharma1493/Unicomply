# Accuracy evaluation: test split

Synthetic data with planted ground truth (generator seed 26264, as of 2026-11-20). The test split holds 729 cases and 26 planted overlap clusters. Whole institution families sit on one side of the split, so nothing leaks between tuning (dev) and reporting (test).

| Setting | Value |
| --- | --- |
| Split | test |
| Engine | real |
| Embeddings mode | tfidf |
| Overlap window | 180 days |
| t_auto / t_review | 0.5 / 0.45 |
| t_probable / t_possible | 0.5 / 0.45 |
| Margin | 0.05 |
| Resolution weights (fuzzy / semantic / acronym / location) | 0.45 / 0.25 / 0.15 / 0.15 |
| Pair weights (text / category / time), decay | 0.6 / 0.25 / 0.15, 60 days |
| Level weights (institution / parent / trust) | 1.0 / 0.8 / 0.6 |

## Results

| Metric | Value | Counts | Target | Status |
| --- | --- | --- | --- | --- |
| Resolution precision | 0.997 | 627/629 | >= 0.97 | met |
| Resolution recall | 0.860 | 627/729 | >= 0.85 | met |
| Resolution F1 | 0.923 | | >= 0.9 | met |
| Review rate | 0.033 | 24/729 | report | |
| Unresolved rate | 0.104 | 76/729 | report | |
| Overlap pair recall (Probable + Possible) | 0.684 | 26/38 | >= 0.9 | **missed** |
| Overlap precision (Probable) | 1.000 | 20/20 | report | |
| Overlap precision (all flagged) | 0.306 | 26/85 | report | |
| Hard-negative false links (same name, other state) | 0 | 0/12 | 0 | met |
| Hard-negative false flags (disposed long ago) | 0 | 0/7 | 0 | met |

Precision and recall are always shown with F1 (Hand and Christen: F1 alone hides the trade-off). Resolution counts only `auto` decisions as links; cases sent to review or left unresolved lower recall, not precision. Overlaps are linked by the engine's own resolution (end to end).

## Overlap pair recall by planted level

| Level | Found, engine-linked | Found, true institution known |
| --- | --- | --- |
| institution | 20/29 (0.690) | 29/29 (1.000) |
| parent | 1/2 (0.500) | 2/2 (1.000) |
| trust | 5/7 (0.714) | 6/7 (0.857) |
| **all** | 26/38 (0.684) | 37/38 (0.974) |

The right-hand column feeds the overlap logic the true institution of every case, so it isolates the overlap scoring from resolution mistakes.

## Resolution by noise type

A case can carry several noise types, so rows overlap.

| Noise | Cases | Precision | Recall | F1 | Review rate |
| --- | --- | --- | --- | --- | --- |
| Typo | 287 | 0.995 | 0.749 | 0.855 | 0.052 |
| Abbreviation | 236 | 0.995 | 0.924 | 0.958 | 0.025 |
| Acronym only | 114 | 1.000 | 0.544 | 0.705 | 0.053 |
| District missing | 139 | 1.000 | 0.849 | 0.918 | 0.058 |
| City for district | 81 | 1.000 | 0.877 | 0.934 | 0.025 |
| Wrong state | 13 | n/a | 0.000 | n/a | 0.000 |
| No noise | 149 | 0.993 | 0.953 | 0.973 | 0.007 |

Reproduce: `python -m app.eval --split test --mode tfidf`
