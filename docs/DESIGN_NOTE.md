# AuditGym: design note

Short description of how the environment is built and why. Full rules: [DECISIONS.md](DECISIONS.md).

## 1. Pipeline

```text
seed + config
  -> history.py   consistent hidden business month (customers, deliveries, invoices, payments, FX)
  -> errors.py    planted errors = changed clerk decisions in the history (D-35)
  -> ledger.py    the whole ledger re-derived from the history (balanced KZT events)
  -> render.py    random ids AFTER injection, row order, public/ + private/ files
  -> verify       invariants on public files == truth; each evidence set reproduces its amount
                  (otherwise retry with the next deterministic draw)
```

An error is never an edited row. It is a decision the clerk made differently: an invoice entered
twice, a payment applied only partly, a rate taken from the wrong day, revenue booked in the other
period. Because every ledger row is recomputed from the history, all consequences stay consistent,
and `provenance.json` records the decision before and after.

## 2. Why the ground truth is correct

`invariants.py` recomputes, from the public files only, what the ledger must contain under the
published `policy.json` (8 invariants: balanced events, invoice totals, AR relief, bank amounts,
period of revenue, rate of every conversion, references, one billing per delivery note).

- **Before injection** the same seed without errors gives zero violations.
- **After injection** the set of violations equals exactly the set implied by `truth.json`
  (duplicate -> INV-8, allocation -> INV-3, FX -> INV-7/INV-4, cutoff -> INV-5). Nothing extra,
  nothing missing.
- **Evidence sufficiency**: for every acceptable evidence set, an independent checker reads only those
  records (+ policy, manifest, fx) and reproduces the expected amount within 1 KZT.

This runs on every generated episode, on 1,000 seeds in development, and again in `check`.

## 3. Difficulty without tricks

- Ids are random and drawn after injection; rows are ordered by time with random ties (or shuffled).
- Every feature that marks an error also appears on legitimate records: re-worded item lines
  (about 20% of honest lines), a booking lag inside the period (about 40% of honest sales), large
  foreign orders, identical totals, recurring orders, corrections with reversal and re-issue on the
  same delivery note, split invoicing of one delivery.
- Evidence is spread over table rows and documents; item lines are visible only through
  `get_document`, which costs a step.
- Errors are at least 10,000 KZT, so the 1 KZT tolerance can never confuse two errors.

## 4. Environment and isolation

Gymnasium-shaped `reset`/`step`, JSON only, no Gymnasium dependency. Five read-only tools, page
size 50 with signed cursors, decimal calculator with a hand-written parser (no `eval`). Every step
costs 1, including errors; 100 steps and 60 s; `truncated` with empty findings. The environment reads
`public/` only; the runner keeps the evaluator in its own process and talks to the agent subprocess
through JSON lines. In closed mode the agent always sees reward 0.

## 5. Reward robustness

The official reward is used unchanged. The matcher demands type, the canonical id set, KZT amount
within tolerance and one full evidence set; it uses maximum one-to-one matching, so repeats are false
positives. Tests cover: perfect vs silence, silence vs false accusation on clean books, duplicates,
flag-everything, guessed ids, missing or partial evidence, wrong currency or amount, malformed input,
resubmission, timeout, step limit, hung agent, and the explanation never changing the score.

## 6. Measured failure analysis

On the 20 published episodes (`results/metrics.md`):

- `oracle` +1.000 at 0 inspection steps: the maximum is reachable on every episode.
- `reconcile` +0.923, F1 1.000, 38.5 inspection steps. During development it missed one duplicate on
  seed 1014: it sorted invoices by the `issued_at` text, and a copy rendered in `+00:00` sorted before
  the original in `+05:00`, so it named the wrong pair. The fix was to compare parsed timestamps.
  This is exactly the timezone trap the data is designed to contain.
- `random` -0.902 and `flag_all` -1.000: guessing and flagging everything are strictly worse than
  silence.

## 7. Limitations

A rule-based reconciliation solves the published episodes, so the environment proves correct scoring
rather than a hard task. One business type and base currency; sales side only; I1 requires a Mon-Thu
month end; replay is exact except for timeouts. No weights were trained and no model improvement is
claimed.
