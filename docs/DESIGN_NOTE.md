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
  same delivery note, split invoicing of one delivery, and 2-3 one-off customers who order the same
  basket twice a few days apart on separate delivery notes (D-14b).
- Measured shortcut: "a customer with exactly two invoices of equal total is a duplicate" found 20 of
  30 duplicates with 1 false alarm on 40 unseen seeds before D-14b; after it, 22 true and 106 false
  (precision 0.17). Only the shared delivery note, checked against credit notes, proves a duplicate.
- Evidence is spread over table rows and documents; item lines are visible only through
  `get_document`, which costs a step.
- Errors are at least 10,000 KZT, so the 1 KZT tolerance can never confuse two errors.

## 4. Environment and isolation

Gymnasium-shaped `reset`/`step`, JSON only, no Gymnasium dependency. Five read-only tools, page
size 50 with signed cursors, decimal calculator with a hand-written parser (no `eval`). Every step
costs 1, including errors; 100 steps and 60 s; `truncated` with empty findings. The environment reads
`public/` only; the runner keeps the evaluator in its own process and talks to the agent subprocess
through JSON lines. In closed mode the agent always sees reward 0.

Hidden seeds. The generator is open source, so without care an agent could search the seed from
`episode_id` and rebuild the answer key (we did it in 5.6 s for a 6-digit seed). Hidden evaluation
therefore sets `AUDITGYM_SECRET`: every RNG stream is seeded with `sha256(secret:seed)`, the episode is
still byte-reproducible for the evaluator, and no public seed leads to it (D-44a). A generated
episode's private files are moved into evaluator memory and deleted from disk at once (D-71a).

## 5. Reward robustness

The official reward is used unchanged. The matcher demands type, the canonical id set, KZT amount
within tolerance and one full evidence set; it uses maximum one-to-one matching, so repeats are false
positives. A negative amount or an empty or oversized `affected_ids` is one false finding, not a
malformed answer; only the brief's limits (30 findings, 10 evidence ids, 1,000 characters) and a
broken schema give -1 (D-61, D-61a). Tests cover: perfect vs silence, silence vs false accusation on clean books, duplicates,
flag-everything, guessed ids, missing or partial evidence, wrong currency or amount, malformed input,
resubmission, timeout, step limit, hung agent, and the explanation never changing the score.

## 6. Measured failure analysis

On the 20 published episodes (`results/metrics.md`):

- `oracle` +1.000 at 0 inspection steps: the maximum is reachable on every episode.
- `reconcile` +0.912, F1 1.000, 43.9 inspection steps. During development it missed one duplicate on
  seed 1014: it sorted invoices by the `issued_at` text, and a copy rendered in `+00:00` sorted before
  the original in `+05:00`, so it named the wrong pair. The fix was to compare parsed timestamps.
  This is exactly the timezone trap the data is designed to contain.
- `random` -0.902 and `flag_all` -1.000: guessing and flagging everything are strictly worse than
  silence.

Per error type, all 20 published episodes (TP/FP/FN; a finding counts under the type it claims;
written by `check` to `results/metrics.md`):

| policy | duplicate_invoice | payment_allocation | fx_conversion | period_cutoff |
|---|---|---|---|---|
| oracle | 9/0/0 | 13/0/0 | 11/0/0 | 15/0/0 |
| reconcile | 9/0/0 | 13/0/0 | 11/0/0 | 15/0/0 |
| random | 0/10/9 | 0/7/13 | 0/6/11 | 0/9/15 |
| flag_all | 0/160/9 | 0/160/13 | 0/140/11 | 0/140/15 |

What the table says:

- `random` spreads its 32 false findings over all four types and never hits: a guessed id set
  almost never equals the canonical one, and even a right guess would lack a full evidence set.
  Its only positive returns are clean months where it happened to submit nothing.
- `flag_all` claims every type on every invoice (600 findings, 30 per episode at the cap): every one
  is a false positive because the amount and evidence never match, so F1 = 0 and the return is -1 on
  clean and erroneous months alike, below silence.
- `reconcile` has no misses per type, but pays for reading: its return ranges from 0.936 on a
  short month to 0.874 on a long one, only through the 0.002 step cost.

## 7. Limitations

A rule-based reconciliation solves the published episodes, so the environment proves correct scoring
rather than a hard task. One business type and base currency; sales side only; I1 requires a Mon-Thu
month end; replay is exact except for timeouts. No weights were trained and no model improvement is
claimed.
