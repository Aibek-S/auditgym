# Implementation Plan (hackathon build)

Status: proposed, 2026-11-20. Deadline: **2026-11-22 23:59 Astana**. Based on
[DECISIONS.md](DECISIONS.md). Nothing here starts before the team approves the decisions.

Principle: every milestone ends with something that **runs end to end** and is committed.
If time runs out, the last finished milestone is still a valid submission.

## Target layout (minimal)

```text
auditgym/
  money.py        # Decimal/int helpers, rounding, fx conversion
  rng.py          # seeded streams (D-40)
  history.py      # clean hidden history: customers, invoices, payments, fx
  ledger.py       # history -> balanced ledger events
  invariants.py   # INV-1..7, independent per-type checkers (D-37)
  errors.py       # 4 injectors + I1/I2 + distractors
  render.py       # ids, order, public/ files, truth.json, provenance.json
  env.py          # reset/step, tools, calculator, budget, modes
  matcher.py      # normalization, matching, P/R/F1, reward
  runner.py       # subprocess JSON protocol, trajectories, evaluator log
  policies/       # random, reconcile, flag_all, oracle
  cli.py          # python -m auditgym generate|run|check
configs/default.json
episodes/train/, episodes/dev/
tests/
Dockerfile, README.md, LICENSE, requirements-dev.txt
```

## Milestones

| # | Milestone | Owner (proposal) | Est. | Done when |
|---|---|---|---|---|
| M0 | Approve DECISIONS.md, init git repo, skeleton, `configs/default.json` | both | 0.5 h | decisions marked approved; `python -m auditgym --help` runs |
| M1 | Clean generator: history -> ledger -> render public files; INV-1..7 pass | Aibek | 2.5 h | seeds 1..50 generate clean companies, all invariants pass, same seed = identical bytes |
| M2 | `duplicate_invoice` + `payment_allocation` + truth/provenance + per-type checkers | Aibek | 2 h | injected violations = declared issues exactly; checker reproduces amounts from evidence |
| M3 | Environment: reset/step, 5 tools, cursors, calculator, errors, budget, modes | Meirbek | 2.5 h | scripted test plays a whole episode; error/limit/after-end cases tested |
| M4 | Matcher + official reward + 8 reference-value tests (DECISIONS section 10) | Meirbek | 1.5 h | all reference values reproduced exactly |
| M5 | Runner (subprocess JSON), trajectories, oracle + flag_all + random | Meirbek | 1.5 h | oracle = 1.0, flag_all < 0, random near -1 on seeds 1..20 |
| M6 | `fx_conversion` + `period_cutoff` + distractor set + clean episodes | Aibek | 2.5 h | per-type checkers pass; reconcile policy does not flag distractors on clean seeds |
| M7 | Interacting I1 + I2, id/order transforms (D-43), leak test | Aibek | 2 h | paired transform: oracle reward unchanged; leak test green |
| M8 | `reconcile` baseline policy | either | 2 h | finds most single errors on dev; results reported honestly |
| M9 | Packaging: Dockerfile, one command, 10 train + 10 dev episodes, trajectories, metrics table | either | 2 h | `docker run --network none` prints the table from a clean clone |
| M10 | Design note, honest limitations, failure analysis, demo script/video | both | 2 h | README + docs final; demo recorded |
| opt | LLM adapter (OpenAI-compatible), demo only | - | 1-2 h | only if M0-M10 are done |

Total about 21 hours plus integration. With 2 people this fits only if the code is written with
heavy agent help and M3-M5 run in parallel with M1-M2. The interface between the two tracks is
the `public/` + `private/` file format (DECISIONS section 2), fixed in M0.

## Priority if time runs short

Cut in this order (last first): opt -> M8 depth (keep a simple reconcile) -> M7 transforms
(keep I1/I2) -> M10 polish. **Never cut**: M1-M5, the leak test, the four types, clean episodes.

## Tests (map to jury criteria)

| Jury criterion | Our tests |
|---|---|
| Contract and isolation (25) | reset/step shapes, every error code, page limit 50, stable cursor, 100-step truncation, timeout, after-end, malformed submit, leak scan |
| Data and truth (25) | INV-1..7 on clean history; violations after injection = declared issues; evidence checker per issue |
| Reward robustness (25) | 8 reference values; duplicates = FP; flag_all < silence on clean; no-evidence = 0 TP; wrong currency; guessed ids; explanation ignored |
| Reproducibility (15) | same seed+actions -> identical trajectory bytes; id/order transform keeps the oracle reward |
| Engineering (10) | one command, versions in logs, trajectories, failure analysis of reconcile, limitations section |
