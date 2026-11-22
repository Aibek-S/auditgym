| policy | split | n | P (all findings) | R (all issues) | mean F1 | mean return | mean inspection steps | mean time s | TP/FP/FN |
|---|---|---|---|---|---|---|---|---|---|
| random | train | 10 | 0.000 | 0.000 | 0.000 | -1.000 | 30.8 | 0.034 | 0/19/24 |
| random | dev | 10 | 0.000 | 0.000 | 0.100 | -0.805 | 39.8 | 0.034 | 0/13/24 |
| random | all | 20 | 0.000 | 0.000 | 0.050 | -0.902 | 35.3 | 0.034 | 0/32/48 |
| reconcile | train | 10 | 1.000 | 1.000 | 1.000 | +0.906 | 46.9 | 0.034 | 24/0/0 |
| reconcile | dev | 10 | 1.000 | 1.000 | 1.000 | +0.918 | 40.9 | 0.033 | 24/0/0 |
| reconcile | all | 20 | 1.000 | 1.000 | 1.000 | +0.912 | 43.9 | 0.033 | 48/0/0 |
| flag_all | train | 10 | 0.000 | 0.000 | 0.000 | -1.000 | 2.0 | 0.028 | 0/300/24 |
| flag_all | dev | 10 | 0.000 | 0.000 | 0.000 | -1.000 | 2.0 | 0.028 | 0/300/24 |
| flag_all | all | 20 | 0.000 | 0.000 | 0.000 | -1.000 | 2.0 | 0.028 | 0/600/48 |
| oracle | train | 10 | 1.000 | 1.000 | 1.000 | +1.000 | 0.0 | 0.002 | 24/0/0 |
| oracle | dev | 10 | 1.000 | 1.000 | 1.000 | +1.000 | 0.0 | 0.002 | 24/0/0 |
| oracle | all | 20 | 1.000 | 1.000 | 1.000 | +1.000 | 0.0 | 0.002 | 48/0/0 |

Per error type, all 20 episodes (TP/FP/FN; a finding counts under the type it claims):

| policy | duplicate_invoice | payment_allocation | fx_conversion | period_cutoff | other type |
|---|---|---|---|---|---|
| random | 0/10/9 | 0/7/13 | 0/6/11 | 0/9/15 | 0 FP |
| reconcile | 9/0/0 | 13/0/0 | 11/0/0 | 15/0/0 | 0 FP |
| flag_all | 0/160/9 | 0/160/13 | 0/140/11 | 0/140/15 | 0 FP |
| oracle | 9/0/0 | 13/0/0 | 11/0/0 | 15/0/0 | 0 FP |

Per-episode P and R follow the brief (0 on a zero denominator, so a correct empty answer on a clean episode has P = R = 0 and F1 = 1); the table shows P and R over all findings and issues.
