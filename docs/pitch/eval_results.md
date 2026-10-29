# Accuracy evaluation: test split

Synthetic data with planted ground truth (generator seed 26264, as of 2026-11-20). The test split holds 769 cases and 24 planted overlap clusters. Whole institution families sit on one side of the split, so nothing leaks between tuning (dev) and reporting (test).

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
| Resolution precision | 0.998 | 655/656 | >= 0.97 | met |
| Resolution recall | 0.852 | 655/769 | >= 0.85 | met |
| Resolution F1 | 0.919 | | >= 0.9 | met |
| Review rate | 0.049 | 38/769 | report | |
| Unresolved rate | 0.098 | 75/769 | report | |
| Overlap pair recall (Probable + Possible) | 0.719 | 23/32 | >= 0.9 | **missed** |
| Overlap precision (Probable) | 1.000 | 15/15 | report | |
| Overlap precision (all flagged) | 0.329 | 23/70 | report | |
| Hard-negative false links (same name, other state) | 0 | 0/9 | 0 | met |
| Hard-negative false flags (disposed long ago) | 0 | 0/5 | 0 | met |

Precision and recall are always shown with F1 (Hand and Christen: F1 alone hides the trade-off). Resolution counts only `auto` decisions as links; cases sent to review or left unresolved lower recall, not precision. Overlaps are linked by the engine's own resolution (end to end).

## Overlap pair recall by planted level

| Level | Found, engine-linked | Found, true institution known |
| --- | --- | --- |
| institution | 16/25 (0.640) | 25/25 (1.000) |
| parent | 2/2 (1.000) | 2/2 (1.000) |
| trust | 5/5 (1.000) | 5/5 (1.000) |
| **all** | 23/32 (0.719) | 32/32 (1.000) |

The right-hand column feeds the overlap logic the true institution of every case, so it isolates the overlap scoring from resolution mistakes.

## Resolution by noise type

A case can carry several noise types, so rows overlap.

| Noise | Cases | Precision | Recall | F1 | Review rate |
| --- | --- | --- | --- | --- | --- |
| Typo | 291 | 0.995 | 0.729 | 0.841 | 0.100 |
| Abbreviation | 277 | 1.000 | 0.888 | 0.941 | 0.058 |
| Acronym only | 102 | 1.000 | 0.520 | 0.684 | 0.049 |
| District missing | 148 | 1.000 | 0.791 | 0.883 | 0.095 |
| City for district | 73 | 1.000 | 0.836 | 0.910 | 0.068 |
| Wrong state | 14 | n/a | 0.000 | n/a | 0.000 |
| No noise | 181 | 1.000 | 0.967 | 0.983 | 0.000 |

## Category suggestion

A TF-IDF + LinearSVC model trained on the 726 dev-split cases picks the right category for 768/769 (0.999) of the test-split cases. The synthetic descriptions are templated, so this is an upper bound for real complaint text.

Reproduce: `python -m app.eval --split test --mode tfidf`
