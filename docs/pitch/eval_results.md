# Accuracy evaluation: test split

Synthetic data with planted ground truth (generator seed 26264, as of 2026-11-20). The test split holds 699 cases and 27 planted overlap clusters. Whole institution families sit on one side of the split, so nothing leaks between tuning (dev) and reporting (test).

| Setting | Value |
| --- | --- |
| Split | test |
| Engine | real |
| Embeddings mode | tfidf |
| Overlap window | 180 days |
| t_auto / t_review | 0.68 / 0.46 |
| t_probable / t_possible | 0.68 / 0.45 |
| Margin | 0.05 |
| Resolution weights (fuzzy / semantic / acronym / location) | 0.45 / 0.25 / 0.15 / 0.15 |
| Pair weights (text / category / time), decay | 0.6 / 0.25 / 0.15, 60 days |
| Level weights (institution / parent / trust) | 1.0 / 0.8 / 0.6 |

## Results

| Metric | Value | Counts | Target | Status |
| --- | --- | --- | --- | --- |
| Resolution precision | 1.000 | 502/502 | >= 0.97 | met |
| Resolution recall | 0.718 | 502/699 | >= 0.85 | **missed** |
| Resolution F1 | 0.836 | | >= 0.9 | **missed** |
| Review rate | 0.050 | 35/699 | report | |
| Unresolved rate | 0.232 | 162/699 | report | |
| Overlap pair recall (Probable + Possible) | 0.455 | 15/33 | >= 0.9 | **missed** |
| Overlap precision (Probable) | 1.000 | 15/15 | report | |
| Overlap precision (all flagged) | 0.500 | 15/30 | report | |
| Hard-negative false links (same name, other state) | 0 | 0/7 | 0 | met |
| Hard-negative false flags (disposed long ago) | 0 | 0/3 | 0 | met |

Precision and recall are always shown with F1 (Hand and Christen: F1 alone hides the trade-off). Resolution counts only `auto` decisions as links; cases sent to review or left unresolved lower recall, not precision. Overlaps are linked by the engine's own resolution (end to end).

## Overlap pair recall by planted level

| Level | Found, engine-linked | Found, true institution known |
| --- | --- | --- |
| institution | 15/24 (0.625) | 24/24 (1.000) |
| parent | 0/3 (0.000) | 3/3 (1.000) |
| trust | 0/6 (0.000) | 0/6 (0.000) |
| **all** | 15/33 (0.455) | 27/33 (0.818) |

The right-hand column feeds the overlap logic the true institution of every case, so it isolates the overlap scoring from resolution mistakes.

## Resolution by noise type

A case can carry several noise types, so rows overlap.

| Noise | Cases | Precision | Recall | F1 | Review rate |
| --- | --- | --- | --- | --- | --- |
| Typo | 274 | 1.000 | 0.646 | 0.785 | 0.124 |
| Abbreviation | 243 | 1.000 | 0.835 | 0.910 | 0.074 |
| Acronym only | 92 | n/a | 0.000 | n/a | 0.000 |
| District missing | 139 | 1.000 | 0.784 | 0.879 | 0.086 |
| City for district | 65 | n/a | 0.000 | n/a | 0.000 |
| Wrong state | 14 | n/a | 0.000 | n/a | 0.000 |
| No noise | 158 | 1.000 | 0.987 | 0.994 | 0.006 |

Reproduce: `python -m app.eval --split test --mode tfidf`
