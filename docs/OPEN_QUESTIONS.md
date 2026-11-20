# Open Questions

> **Answered by [DECISIONS.md](DECISIONS.md).** The organizers cannot be asked (A0.1 is closed:
> no further material exists). Each question below now has a D-xx decision there; this file
> keeps the reasoning and alternatives. Note: G2 tolerance became 100 minor units (1 KZT)
> for all types (D-63), and C2 duplicate ids became both invoices (D-33).

Status: **none of these are decided.** "Recommended default" is a proposal to speed up review.
The team approves or changes it. Priority: **P0** = blocks implementation start; **P1** = needed
before error-type work; **P2** = can wait.

## A0. Before everything (P0)

**A0.1 Has the organizers' full check definition been published?** The brief says full check
definitions are published before the start, with only seeds and values hidden.
- Why: it may fix exact type strings, file schemas, adapter interface, and the run command.
  Many questions below may already be answered there.
- Default: obtain it first. Re-check every default below against it.

## Business model

**B1. Model the purchase side (supplier invoices, AP)?** (P1)
- Why: realism vs scope. The official `invoices.jsonl` has no direction field.
- Options: (a) sales only; (b) sales + supplier invoices with errors; (c) sales documents + aggregate purchase ledger rows.
- Default: **(c)**.

**B2. Final company name and setting.** (P2)
- Default: NorthAngels FoodService Ltd., fictional city in Kazakhstan, base KZT.

**B3. Returns: separate credit-note document or negative invoice?** (P1)
- Why: affects schemas and the duplicate-detection distractor.
- Default: an invoice record with negative `total_minor` and a reference to the original
  invoice in `line_items`. It stays inside the official schema.

**B4. Which event decides the period: invoice date or delivery date?** (P0)
- Why: cutoff truth depends on it. Delivery date is not an official field.
- Default: `issued_at` = transfer of control (invoice raised on delivery). State this in `policy.json`.
  Cutoff errors are therefore ledger timestamp vs `issued_at`.

## Accounting model

**A1. Chart of accounts size.** (P1) Default: about 10 accounts as in BUSINESS_MODEL section 9.

**A2. Opening balances.** (P1)
- Why: partial payments of previous-month invoices are realistic but need prior state.
- Options: none / opening AR invoices visible in records.
- Default: a small number of opening invoices dated before the period, visible in records.

**A3. Ledger currency.** (P0)
- Why: `ledger.csv` has a `currency` column. Are foreign transactions booked in foreign currency
  rows or only in KZT? This decides how FX errors are visible.
- Options: (a) all ledger rows in KZT; (b) dual rows (foreign + KZT).
- Default: **(a)**. The ledger is in base currency. Documents carry the foreign currency. The FX
  error is visible as booked KZT vs document amount x correct rate.

**A4. Rounding.** (P0) Default: convert using decimal arithmetic, round half-up to the minor unit
once per document, per `policy.json`.

**A5. Missing FX rate days (weekends).** (P1) Default: policy says "last available rate on or before the date".

## Error scenarios

**C1. Exact type strings.** (P0) Default: `duplicate_invoice`, `payment_allocation`, `fx_conversion`,
`period_cutoff`, unless the organizers' spec defines others.

**C2. Canonical `affected_ids` per type.** (P0)
- Why: TP requires canonical ids. An ambiguous convention silently creates FN.
- Default: see ERROR_SCENARIOS. Duplicate = only the duplicate invoice id; allocation =
  `[payment_id, invoice_id]`; FX = document id of the misconverted record; cutoff = invoice id.
  The set is compared order-insensitively.

**C3. How to tell a duplicate from a legitimate repeat.** (P0)
- Why: without a distinguishing field, a duplicate cannot be proven, so the task would be unsolvable.
- Options: delivery or order reference inside `line_items`; identical line-item detail; ledger evidence.
- Default: each invoice line carries a delivery note reference. A duplicate repeats the same reference.

**C4. Error count per episode and mix.** (P1) Default: 0-6 for train/dev (official max 12),
at least 25% clean episodes, interacting scenarios in about 25%.

**C5. Interacting scenario amounts.** (P1) Default: each issue has its own independently
computed amount (see ERROR_SCENARIOS section 5).

## Financial evidence

**D1. Evidence for a missing ledger row.** (P0) Default: the cash row of the payment + the
payment doc + the invoice doc form an acceptable set.

**D2. How many acceptable evidence sets per issue?** (P1) Default: 1-3 alternatives. A finding
needs one full set. Extra evidence ids are allowed and not penalized (up to 10).

**D3. Do evidence ids mix document ids and ledger row ids?** (P0) Default: yes. All public ids
are globally unique across tables (prefix-free random ids), so no table name is needed.

## Agent interface

**E1. Observation encoding.** (P1) Default: plain JSON dict with `task`, `result`, `error`,
`steps_remaining`. Same keys every step.

**E2. Per-invoice allocation inside payments.** (P0)
- Why: `invoice_refs` is a list of ids. Split and combined payments need allocated amounts per invoice.
- Options: list of ids only (allocation visible only in the ledger); list of objects `{invoice_id, amount_minor}`.
- Default: ids only, matching the brief literally. Allocations are visible in ledger AR rows by
  `invoice_id` + `payment_id`. Re-check against the organizers' spec.

**E3. Cursor format.** (P1) Default: opaque string encoding offset + episode-specific salt.
It stays stable within an episode and reveals nothing.

**E4. Time limit.** (P1) Default: 60 s wall clock per episode (suggested limit), checked per step.

## Environment security

**F1. Process isolation mechanism.** (P1) Options: separate process with JSON over stdin/stdout;
separate containers; same process with strict API. Default: the runner owns env + evaluator, and
policies run as a subprocess speaking JSON. This meets "evaluator outside the agent process".

**F2. Does the first observation reveal the number of errors?** (P0) Default: **no**. That would
leak truth. Only task text, manifest, policy, budget.

**F3. Leak tests.** (P1) Default: an automated test scans all observations and trajectories
for every truth-only value (issue ids, expected amounts that do not appear in open records,
provenance strings).

## Evaluation

**G1. Does `submit` count in `inspection_steps`?** (P0) Default: no. Count only non-submit actions.
It still counts toward the 100-step limit.

**G2. Amount tolerance.** (P0) Default: exact for duplicate and allocation; +/-1 minor unit
for FX and cutoff conversions. The tolerance is published with the matcher.

**G3. Tie-breaking in one-to-one matching.** (P0) Default: maximum-cardinality assignment.
Ties are broken by finding order in the submission, then by issue id. The rule is published and
deterministic.

**G4. Behaviour of steps after termination.** (P1) Default: return an error, no reward change,
no re-scoring.

**G5. Experimental reward?** (P2) Default: none in MVP. If added, it is reported separately.

## Implementation priorities

**H1. Order of work.** (P0) Default (from the brief): contract + 2 types -> 4 types + clean +
distractors -> interactions + isolation + attacks -> packaging.

**H2. Language and runtime.** (P0) Default: Python 3.11 (the brief's offline target), no heavy dependencies.

**H3. Who owns what.** (P0) Proposal: person 1 owns simulation + injector + renderer (data + truth);
person 2 owns env + tools + matcher + reward + baselines. Both own tests.

**H4. Time on 22 November.** (P0) Packaging, docs, episodes, trajectories, and demo need about
4+ hours. Someone must own this day.

**H5. LLM adapters.** (P2) Default: skip for the official submission; maybe one optional adapter for the demo.
