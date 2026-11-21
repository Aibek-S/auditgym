| policy | split | n | P (all findings) | R (all issues) | mean F1 | mean return | mean inspection steps | mean time s | TP/FP/FN |
|---|---|---|---|---|---|---|---|---|---|
| random | train | 10 | 0.000 | 0.000 | 0.000 | -1.000 | 30.8 | 0.171 | 0/21/24 |
| random | dev | 10 | 0.000 | 0.000 | 0.100 | -0.805 | 39.8 | 0.195 | 0/14/24 |
| random | all | 20 | 0.000 | 0.000 | 0.050 | -0.902 | 35.3 | 0.183 | 0/35/48 |
| reconcile | train | 10 | 1.000 | 1.000 | 1.000 | +0.917 | 41.4 | 0.201 | 24/0/0 |
| reconcile | dev | 10 | 1.000 | 1.000 | 1.000 | +0.929 | 35.6 | 0.200 | 24/0/0 |
| reconcile | all | 20 | 1.000 | 1.000 | 1.000 | +0.923 | 38.5 | 0.200 | 48/0/0 |
| flag_all | train | 10 | 0.000 | 0.000 | 0.000 | -1.000 | 2.0 | 0.177 | 0/300/24 |
| flag_all | dev | 10 | 0.000 | 0.000 | 0.000 | -1.000 | 2.0 | 0.176 | 0/300/24 |
| flag_all | all | 20 | 0.000 | 0.000 | 0.000 | -1.000 | 2.0 | 0.177 | 0/600/48 |
| oracle | train | 10 | 1.000 | 1.000 | 1.000 | +1.000 | 0.0 | 0.011 | 24/0/0 |
| oracle | dev | 10 | 1.000 | 1.000 | 1.000 | +1.000 | 0.0 | 0.011 | 24/0/0 |
| oracle | all | 20 | 1.000 | 1.000 | 1.000 | +1.000 | 0.0 | 0.011 | 48/0/0 |

Per-episode P and R follow the brief (0 on a zero denominator, so a correct empty answer on a clean episode has P = R = 0 and F1 = 1); the table shows P and R over all findings and issues.
