# Design Decisions (contract freeze candidate)

Status: **APPROVED by the team, 2026-11-20** (with amendment D-14a). Version `decisions-v0.1`.
Changes after approval go through a PR approved by both members (see [CONTRIBUTING.md](../CONTRIBUTING.md)).

We cannot ask the organizers. The case brief and the colleague's concept are the only inputs.
So we decide every unclear detail ourselves using three rules:

1. **Copy the brief literally** wherever it is specific (file names, fields, 5 actions,
   limits, reward formula). Labeled **[BRIEF]**.
2. **Choose the simplest rule we can defend**, and **publish it** in `policy.json`, the README,
   and the matcher code. Labeled **[OURS]**.
3. **Make every [OURS] rule a config value**, not hard-coded logic, so it can change in one
   place. The config key is given in `code` where relevant.

This file supersedes the "recommended defaults" in [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)
and the proposals in [ERROR_SCENARIOS.md](ERROR_SCENARIOS.md) where they differ.
Each decision has an id (D-xx) so the team can approve or reject it line by line.

---

## 1. Company and episode

| ID | Decision | Label |
|---|---|---|
| D-01 | Company: **NorthAngels FoodService Ltd.**, one fictional legal entity, food wholesale and delivery to HoReCa and traders. All names, ids, and amounts are generated. | [OURS] |
| D-02 | Documents are **sales side only**: customer invoices, credit notes, and customer payments. Purchases appear only as aggregate ledger rows (volume and realism, no errors). | [OURS] |
| D-03 | One episode = one company = one **calendar month**. | [BRIEF] one period, [OURS] month |
| D-04 | Base currency **KZT**. Foreign currencies **USD, EUR**. All exponents are 2 (1 KZT = 100 minor units). Exponents are listed in `manifest.json`. | [OURS] |
| D-05 | Company timezone: fixed offset **+05:00**. `manifest.timezone = "+05:00"`, so there is no DST and no tzdata dependency. | [OURS] |
| D-06 | Records cover the period **plus a 5-day window after it** (`cutoff_window_days = 5`) so cutoff errors are provable. Open invoices from before the period appear as **opening balances** (see D-17). | [OURS] |
| D-07 | Default size (`config: default`, amended in #2): 8-20 customers, 40-90 planned invoices (about 50-110 with recurring orders and distractors), payments derived (about one per invoice), at least 200 ledger rows (topped up with aggregate purchases), at most 184 documents before errors (16 reserved for injected documents), 0-6 errors. The hard limits allowed by the config match the brief: 2,000 rows, 200 documents, 12 errors. | [BRIEF] ranges, [OURS] default |
| D-08 | Share of foreign-currency invoices: about 20% (`foreign_share = 0.2`). | [OURS] |
| D-09 | The period month is drawn from the seed (any month of 2025-2027). Dates therefore vary across episodes; see the I1 constraint in section 6. | [OURS] |

## 2. Open file formats [BRIEF fields, OURS details]

Field names are exactly as in the brief. No extra columns are added. Missing links are explicit
`null`.

**`manifest.json`**: `schema_version` (`"1.0"`), `episode_id`, `base_currency`, `period_start`,
`period_end` (ISO-8601 with offset; end is exclusive: `2026-11-01T00:00:00+05:00`), `timezone`,
`currency_exponents` (`{"KZT":2,"USD":2,"EUR":2}`), `counts`
(`{"ledger":n,"invoices":n,"payments":n,"fx":n,"documents":n}`), `rounding` (`"half_up"`).

**`ledger.csv`**: `row_id, timestamp, account, debit_minor, credit_minor, currency, entity_id, invoice_id, payment_id`.
- D-10: **all ledger rows are in base currency KZT**. Foreign amounts live in documents. An FX
  error is therefore visible as ledger KZT not equal to document amount x policy rate. [OURS]
- D-11 (amended in #1): a business event = rows with the same `timestamp` and the same
  `payment_id` if it is set, otherwise the same `timestamp` + `invoice_id`. Reason: in a receipt
  the bank row has `invoice_id = null` (one payment can settle several invoices), while each AR
  credit row carries its invoice. Every event balances (debits = credits). We do not add a
  transaction-id column. [OURS]
- D-12: empty `invoice_id`/`payment_id`/`entity_id` are written as an empty CSV cell, which
  means `null`. Tools return JSON `null`. [OURS]

**`invoices.jsonl`**: `doc_id, invoice_id, entity_id, issued_at, due_at, currency, total_minor, line_items`.
- D-13 (amended in #1): `line_items` = list of `{line_no, sku, description, quantity, unit_price_minor, amount_minor, delivery_note_id, ref_invoice_id}`.
  `total_minor = sum(amount_minor)`. `ref_invoice_id` is `null` on normal lines and names the
  reversed invoice on credit-note lines. [OURS]
- D-14: **`delivery_note_id` identifies the physical delivery.** A legitimate repeat order has a
  new delivery note. A duplicate invoice repeats an existing one. This makes duplicates provable. [OURS]
- D-14a: **Duplicates must not be detectable by one exact field match.** Exact, similar, and
  verified levels all exist in the data:
  - the copy has a new random `invoice_id`/`doc_id`, `issued_at` shifted 0-3 days, and per seed
    may have reordered lines and re-worded descriptions (`"Milk 3.2% 1L"` -> `"Milk 3,2 % 1 l"`);
  - **legitimate same delivery note:** a credit note fully reverses the original, followed by a
    corrected re-issue with the same `delivery_note_id`. This is a correction, not a duplicate.
    The agent must check for the reversal;
  - **legitimate same lines and total:** a recurring order with a new `delivery_note_id`;
  - **legitimate split invoicing:** one delivery note split over two invoices with **different**
    lines whose sum equals the delivery.
  So the proof is: same delivery note + same goods + **no reversing credit note** + both booked to
  revenue. Supplier invoice numbers (`GF-104` vs `GF104`) do not exist here: we are sales side
  and the brief's invoice schema has no external number field. [OURS, team input 2026-11-20]
- D-15: a **credit note** (return) is an invoice record with negative `total_minor`. Its lines
  carry `delivery_note_id` of the returned delivery, `ref_invoice_id` of the original, and
  `description` `"Return of <invoice_id>"` or `"Reversal of <invoice_id>"`. Ledger: `Dr 4100 / Cr 1200`
  with `invoice_id` = the credit note's own id. [OURS]

**`payments.jsonl`**: `doc_id, payment_id, timestamp, currency, amount_minor, invoice_refs`.
- D-16: `invoice_refs` = list of invoice ids named in the customer's remittance. `null` if the
  payment has no reference. Per-invoice allocated amounts are **not** in the document. They are
  in the ledger AR credit rows (`invoice_id` + `payment_id`). [BRIEF] list, [OURS] allocation in ledger
- D-17: opening balance: for each open invoice from the previous month, the invoice document is
  included (issued before the period) plus one event dated `period_start`:
  Dr `1200` / Cr `3900 Opening balance`. [OURS]

**`fx.csv`**: `date, source_currency, target_currency, rate`.
- D-18: rates for USD->KZT and EUR->KZT only, **business days only** (Mon-Fri), from 10 days before
  the period to the end of the window. `rate` = KZT per 1 unit, decimal string with 2 decimals
  (`"481.25"`). Values follow a seeded random walk. [OURS]
- D-19: an fx row's public id is the composite key **`<date>:<source>:<target>`**, for example
  `2026-10-14:EUR:KZT`. It is used by `get_record` and in `evidence_ids`. [OURS]

**`policy.json`** (shown to the agent in the first observation):

```json
{
  "period_basis": "invoice issued_at, local date (+05:00) = transfer of control",
  "fx_rate_date": "local date (+05:00) of the document timestamp",
  "fx_missing_rate": "last available rate before that date",
  "fx_conversion": "target_minor = round_half_up(source_minor * rate), once per document amount",
  "foreign_invoice_settlement": "AR relieved at carrying amount; difference to account 7000",
  "unallocated_receipts_account": "1900",
  "amount_currency_for_findings": "KZT",
  "amount_tolerance_minor": 100,
  "payment_allocation": "payments in timestamp order; each applied to its invoice_refs in listed order, each invoice up to its open balance after earlier credit notes; remainder to 1900; foreign invoices relieved pro rata at carrying KZT, final settlement relieves the exact remainder"
}
```

## 3. Chart of accounts [OURS]

| Account | Meaning |
|---|---|
| `1010` | Bank KZT |
| `1020` | Bank USD (valued in KZT) |
| `1030` | Bank EUR (valued in KZT) |
| `1200` | Accounts receivable |
| `1900` | Unallocated receipts (suspense) |
| `2000` | Accounts payable (aggregate purchases) |
| `2100` | Customer advances |
| `3900` | Opening balance |
| `4000` | Revenue |
| `4100` | Sales returns |
| `5000` | Purchases / cost of goods (aggregate) |
| `7000` | FX gain / loss |

Normal events: sale `Dr 1200 / Cr 4000`; return `Dr 4100 / Cr 1200`; receipt
`Dr 10x0 / Cr 1200` per allocated invoice (+ `Cr 1900` for the unreferenced part or an
overpayment, + `7000` for the FX difference); aggregate purchase `Dr 5000 / Cr 2000`;
supplier payment `Dr 2000 / Cr 1010`.

## 4. Accounting invariants (checked on the clean history) [OURS, required by jury check "Data and truth"]

| ID | Invariant |
|---|---|
| INV-1 | Every event balances: sum(debit) = sum(credit). This also holds **after** injection, because the errors are designed to pass the trial balance. |
| INV-2 | Invoice `total_minor` = sum of line amounts. |
| INV-3 | For each invoice: AR net in KZT = carrying amount - relieved amounts. Fully paid -> 0. |
| INV-4 | For each payment: bank debit = `round(amount_minor * rate(payment local date))`; bank = AR credits + 1900 + FX difference. |
| INV-5 | Revenue rows fall in the period if and only if the invoice `issued_at` local date falls in the period. |
| INV-6 | Every non-null reference resolves to an existing record. There are no guessed links. |
| INV-7 | Every amount in KZT is derived from the documents and `fx.csv` by the policy rule. |
| INV-8 | (added in #2) A (delivery note, sku) is billed on at most one sale invoice, unless a credit note fully reverses it. This is the formal duplicate rule (D-14a). |

All INV checks run on the **public files only** (`auditgym/invariants.py`), so anyone can re-verify an episode without the hidden files.

After injection, the verifier recomputes INV-1..7. The set of violations must equal **exactly**
the declared issues: nothing missing, nothing extra.

## 5. The four error types

Common rules [OURS]:
- **D-30** Type strings: `duplicate_invoice`, `payment_allocation`, `fx_conversion`, `period_cutoff`.
- **D-31** `claimed_amount_minor` = the absolute misstatement **in the ledger, in KZT**
  (`currency = "KZT"`) for every type. This gives one rule that is easy to explain and is always
  computable from the ledger and documents.
- **D-32** Minimum error size 10,000.00 KZT, so the tolerance (100 minor units = 1 KZT) can never
  confuse two errors.
- **D-33** `affected_ids` use business ids (`invoice_id`, `payment_id`) and are compared as a **set**.
  `evidence_ids` use `doc_id`, ledger `row_id`, and fx keys (D-19).
- **D-34** Each issue has 1-3 **acceptable evidence sets**. A finding qualifies if its
  `evidence_ids` **contain at least one full set**. Extra ids are allowed, within the max of 10.
- **D-35** Errors are injected as a **changed decision in the hidden history** (for example "clerk
  used the wrong rate date"). Then all affected rows are re-derived. `provenance.json` stores the
  before value, the after value, and the touched records.

| Type | Injection (what changes) | `affected_ids` | Amount (KZT) | Acceptable evidence sets |
|---|---|---|---|---|
| `duplicate_invoice` | A copy of invoice A is issued (new `invoice_id`, `doc_id`, 0-3 days later, **same `delivery_note_id` and lines**) and booked `Dr 1200 / Cr 4000`. | `{A, A_copy}` | KZT booked for the copy | `{doc A, doc A_copy, revenue row of copy}` or `{doc A, doc A_copy, AR row of copy}` |
| `payment_allocation` | Payment P names invoice X in `invoice_refs` and its amount covers X, but the clerk credits AR for X with **less or nothing**. The rest goes to `1900`. Variants: `missing` (all to 1900), `partial`. | `{P, X}` | KZT credited to `1900` instead of AR | `{doc P, doc X, 1900 row of P}` or `{doc P, doc X, AR credit row of P}` (partial only) |
| `fx_conversion` | A USD/EUR document is converted with a rate from the **wrong date**. Variants: previous business day, rate from 2-10 days earlier, **UTC date instead of local date**. Side: invoice (revenue/AR) or payment (bank). | `{invoice_id}` or `{payment_id}` | abs(booked KZT - correct KZT) | `{doc, booked ledger row, fx key of correct rate}` |
| `period_cutoff` | Revenue of invoice X is dated in the **wrong period**. Variants: issued in the window after the period but booked inside it (overstated); issued in the last days but booked after the period end (understated). | `{X}` | KZT booked in the wrong period | `{doc X, revenue row of X}` or `{doc X, AR row of X}` |

FX example: invoice 1,000.00 EUR (`100000`) issued 2026-10-14 local. Correct rate on
`2026-10-14:EUR:KZT` is `"552.10"` -> 55,210,000 minor. The ledger booked `"549.30"` (rate from
2026-10-10) -> 54,930,000. Finding amount = `280000`, `currency: "KZT"`.

Generation constraints [OURS]:
- **D-36** At most one injected error per record, except in the interacting scenarios.
  `fx_conversion` is never injected on a payment that also has an allocation error.
- **D-37** An error is accepted only if an **independent checker** for its type, given only the
  records in one evidence set (+ `policy.json`), reproduces the expected amount. Otherwise the
  generator retries with the next RNG draw. This is our proof of "evidence sufficiency".

## 6. Interacting scenarios (two) [BRIEF requires two, OURS chooses them]

| ID | Name | Issues | Why it is hard |
|---|---|---|---|
| **I1** | Foreign-currency invoice at the period boundary | One USD/EUR invoice issued in the first hours of the next period (local time). Its timestamp is rendered in `+00:00`, so the UTC date is still the last day of the period. Root cause: the clerk used the UTC date. Result: `period_cutoff` (booked in the period) **+** `fx_conversion` (last-day rate used). The customer also made a legitimate **partial payment** in that currency (distractor). | One root cause, two independent issues. A timezone trap. Partial payment noise. |
| **I2** | Partial allocation around a duplicated invoice | Invoice A has a duplicate A_copy. The customer pays A in full (KZT). Confused by the copy, the clerk credits A only partly; the rest goes to `1900`. Result: `duplicate_invoice {A, A_copy}` **+** `payment_allocation {P, A}`. | Two errors sharing a record. Correcting one does not change the other's amount. |

Constraint for I1: the UTC-date rate and the local-date rate must **differ**. With the
weekend rule, this needs the period's last day to be **Mon-Thu**. Example: 31 Oct 2026 is a
Saturday, so both dates would use Friday's rate and the FX error would be zero. Therefore the
period month varies by seed (D-09), and I1 is only placed in a month whose last day is Mon-Thu.
The checker in D-37 rejects any zero-amount error anyway.

I1 covers the brief's own example (partial payment, other currency, period boundary). The partial
payment there is legitimate, while the errors are cutoff and FX. Each issue's amount is defined
independently (D-31), so matching is unambiguous.

### Implementation notes (#3)

- **Verified generation.** `generate` accepts an episode only if `invariants.verify_episode` passes:
  the INV violations recomputed from the public files equal exactly the set implied by
  `truth.json` (duplicate -> INV-8, allocation -> INV-3, FX on invoice -> INV-7, FX on payment ->
  INV-4, cutoff -> INV-5), and every evidence set reproduces its amount within the tolerance.
  Otherwise the error draw is retried with stream `errors:<attempt>` (max 25), so a seed is still
  deterministic. A forced `errors.plan` never silently changes type.
- **Data-safety rules.** Distractor records (and the payments/invoices linked to them) are never
  touched; each record carries at most one error except inside I1/I2; amounts below
  `min_amount_minor` (10,000 KZT) are rejected; a fully missing allocation writes no zero AR row.
- **No single-feature shortcuts.** About 20% of legitimate invoice lines use the alternative
  wording, about 40% of legitimate sales are booked 10 min-18 h after issue (never across the
  period boundary), and 3-5 large legitimate foreign orders exist in every episode (same size class
  as the I1 invoice).
- **I1 needs a Mon-Thu month end.** If the period ends on Fri/Sat/Sun, the UTC-date and local-date
  rates are equal and I1 cannot exist; the random mix then uses I2 instead.
- Default mix (`errors` in config): 25% clean, 30% with one interacting scenario (+0-4 extra
  errors), the rest 1-6 single errors.

## 7. Clean episodes and distractors [BRIEF requires, OURS lists]

Clean episode = no injected errors, empty `truth.issues`, correct answer = empty findings.
Distractors are present in **every** episode, clean or not:

| Distractor | Mimics |
|---|---|
| Recurring weekly order: same customer and total, **new** delivery note | duplicate |
| Two customers with identical totals | duplicate |
| Return (credit note) followed by a corrected re-issue | duplicate |
| Split payments (2-3 payments settle one invoice) | allocation |
| Combined payment (one payment settles 2-4 invoices) | allocation |
| Customer underpaid: payment fully allocated, invoice legitimately still open | allocation |
| Payment with `invoice_refs = null` correctly parked in `1900` | allocation |
| Overpayment: invoice fully allocated, excess correctly in `1900` | allocation |
| Realised FX gain/loss on a foreign payment (`7000` row) | fx |
| Document dated on a weekend, converted with Friday's rate | fx |
| Timestamps near local midnight, rendered in `+00:00` and booked correctly | fx, cutoff |
| Invoices on the last day / first day of a period, booked correctly | cutoff |
| Payment in the next period for an invoice of this period | cutoff |

## 8. Variation and anti-pattern rules [BRIEF requires variation, OURS defines how]

- **D-40** Separate RNG streams derived from the master seed: `history`, `errors`, `names`, `ids`,
  `order`, `fx`. Sub-seed = `sha256(f"{seed}:{stream}")`. Stdlib `random.Random` only. Money uses
  `int` and `Decimal`, never `float`.
- **D-41** All public ids are random (`INV-7Q2KD9`, `DOC-…`, `PAY-…`, `L-…`, `C-…`, `DN-…`), drawn
  **after** injection from the `ids` stream. Injected records cannot be recognised by their id.
- **D-42** File order: ledger and documents in chronological order with **random tie-breaks**
  (`order_mode = chronological`). Paired checks use `order_mode = shuffled`. Injected rows are
  never appended at the end.
- **D-43** Isomorphic transform for the paired checks: `id_salt` (re-maps every id) and
  `order_mode`/`order_salt`. Truth is re-mapped with the same map, so the oracle answer and its
  reward stay equal.
- **D-44** Vary per episode: customer names, ids, amounts, currencies, timestamp offsets
  (`+05:00` / `+00:00`), error count, and mix.

## 9. Environment and tools [BRIEF contract, OURS details]

- **D-50** `reset(seed, config) -> (observation, info)`. First observation:
  `{task, manifest, policy, tables, steps_remaining: 100}`. `info = {episode_id, schema_version, mode}`.
- **D-51** `step(action) -> (observation, reward, terminated, truncated, info)`. Every observation
  has the same keys: `{ok, result, error, steps_used, steps_remaining}`.
  `error = {code, message}` from a **fixed list** of codes: `unknown_action`, `bad_arguments`,
  `unknown_table`, `not_found`, `bad_cursor`, `calc_error`, `invalid_submission`, `episode_over`.
  No stack traces, paths, or truth hints.
- **D-52** Action format: `{"action": "<name>", ...args}`.
  - `list_records(table, cursor=null, limit=50)`: tables `ledger | invoices | payments | fx`.
    `limit` is clamped to 1..50. Returns `{rows, next_cursor}`. Invoice rows omit `line_items`.
  - `get_record(table, id)`: ledger by `row_id`; invoices by `invoice_id` or `doc_id`; payments
    by `payment_id` or `doc_id`; fx by key (D-19).
  - `get_document(doc_id)`: full invoice (with `line_items`) or payment.
  - `calculator(expression)`: `Decimal` arithmetic, numbers, `+ - * /`, parentheses, unary minus,
    at most 200 characters. Result is a decimal string. Anything else -> `calc_error`.
  - `submit(findings)`: ends the episode.
- **D-53** Cursor = opaque string, valid only within the episode. Same cursor -> same page.
- **D-54** **Every** `step` call costs one step, including errors and `submit`. Max 100. If step 100
  is not `submit` -> `truncated = true`, findings = empty.
- **D-55** Time limit 60 s wall clock per episode (`time_limit_s`). Exceeded -> `truncated = true`,
  findings = empty. Note: only a timeout can break exact replay. This is documented.
- **D-56** `step` after the end -> `{ok: false, error: episode_over}`, reward 0, no re-scoring,
  no step charged.
- **D-57** Modes: `open` (training): the terminal reward is returned at `submit`. `closed`
  (evaluation): reward is always 0 to the policy. Score and diagnostics go only to the evaluator log.
- **D-58** `episode_id` = random hex drawn from the seeded RNG. It does not reveal the seed.

## 10. Submission, matcher, reward

- **D-60** Submission schema [BRIEF]: `{episode_id, findings:[{type, affected_ids, claimed_amount_minor, currency, evidence_ids, explanation}]}`.
  Limits: 30 findings, 10 `evidence_ids`, 1,000 characters of explanation. [OURS] `affected_ids` 1..10.
- **D-61** **Malformed** (reward -1, `terminated = true`): not an object, missing or wrong-type
  field, a limit exceeded, `claimed_amount_minor` not a non-negative integer, or a wrong
  `episode_id`. Extra unknown keys are **ignored**, not malformed.
- **D-62** Normalization (published code):
  - type: lowercase, trim, spaces and `-` to `_`, then a public alias table, e.g.
    `partial_payment`, `duplicate`, `fx_rate_error`, `cutoff`, map to the four types;
  - ids: trim; `doc_id` <-> business id mapping for invoices and payments, so either form is accepted
    in both `affected_ids` and `evidence_ids`; duplicates are removed;
  - currency: uppercase.
  - An unknown type after normalization is not malformed; it can only be FP.
- **D-63** Candidate pair (finding, issue): same type, same `affected_ids` set, same currency,
  `abs(claimed - expected) <= 100`, and evidence contains a full acceptable set.
- **D-64** One-to-one assignment = maximum bipartite matching. It is deterministic: findings are
  taken in submission order, issues in sorted canonical order. TP = matched; FP = findings - TP;
  FN = issues - TP. A repeated finding is FP.
- **D-65** P, R, F1 exactly as in the brief, including the empty cases.
- **D-66** Reward [BRIEF, unchanged]: `R = clip(2*F1 - 1 - 0.002*inspection_steps, -1, 1)`.
  **`inspection_steps` = all steps before `submit`** (errors included, `submit` excluded).
  Truncation scores empty findings with all steps used. No experimental reward in v1.
- **D-67** `explanation` is stored and logged but **never** affects the score.

Reference values (to be asserted in tests):

| Case | F1 | R |
|---|---|---|
| Perfect answer after 40 inspection steps | 1 | 0.92 |
| Same answer after 20 / 60 steps | 1 | 0.96 / 0.88 |
| Silence on books with errors, 10 steps | 0 | -1.0 |
| Silence on a clean company, 10 steps | 1 | 0.98 |
| One false finding on a clean company | 0 | -1.0 |
| 3 issues, 30 findings incl. 3 TP, 30 steps | 6/33 | -0.70 |
| Correct ids, no evidence | 0 | -1.0 |
| Malformed submission | - | -1.0 |

## 11. Isolation and files [BRIEF requires, OURS mechanism]

- **D-70** Each episode directory has `public/` (6 open files) and `private/` (`truth.json`,
  `provenance.json`, `seed_config.json`). The environment loads **only** `public/`.
- **D-71** The **runner** process owns the environment and the evaluator. Policies run as a
  **subprocess** speaking JSON lines over stdin/stdout. They get no object references, files, or
  paths. In the container, `private/` is readable only by the runner, and the run uses `--network none`.
- **D-72** The oracle is an evaluator-side baseline. It reads `private/truth.json` inside the runner
  and is never available to other policies.
- **D-73** Leak test: collect truth-only tokens (issue ids, provenance strings, seed, config values)
  and assert none appears in any observation, `info`, error message, or `trajectories.jsonl`.

## 12. Baselines, trajectories, splits

- **D-80** The four baseline adapters are ours to write (the brief asks to submit them):
  `random` (fixed seed: random valid actions for a random 5-60 steps, then submits 0-3 random
  findings from seen ids), `reconcile` (rule-based: scans tables, checks delivery notes, payment
  allocation, FX recompute, cutoff dates), `flag_all` (30 findings over all types and seen ids),
  `oracle` (truth -> canonical findings, 0 inspection steps -> R = 1.0).
- **D-81** `trajectories.jsonl`: one line per step with `episode_id, step, action, observation,
  reward, terminated, truncated` (+ `policy`). The reset is written as step 0 with `action: null`.
  Closed mode writes reward 0.
- **D-82** Published episodes: train seeds `1001-1010`, dev seeds `2001-2010`, config `default`.
  Each split has 3 clean, 3 with an interacting scenario, and 4 with 1-6 single errors.
  Hidden evaluation uses other seeds and the paired transforms. [OURS mirrors BRIEF 20/5/5]
- **D-83** Versions written to every run log: `schema_version`, `generator_version`, `config_id`
  + `config_version`, `decisions-v0.1`.

## 13. Technology [OURS]

- **D-90** Python 3.11, standard library only. `pytest` is the only pinned dev dependency. We do not
  inherit from Gymnasium, because the brief makes it optional and it would add a dependency. The
  method signatures still follow the Gymnasium shape.
- **D-91** One command: `docker build -t auditgym . && docker run --rm --network none auditgym`
  runs `python -m auditgym check` = generate episodes -> verify invariants and evidence -> tests ->
  4 baselines on train/dev -> metrics table.
- **D-92** No database, no LLM in the core, no GPU, no network. An LLM adapter is an optional
  demo-only module after everything else works.
- **D-93** License: MIT for our code.

## 14. Colleague's concept: what we keep and what we defer

Kept: causal simulation (clean history -> injected change -> provenance), separate generator,
environment and evaluator, evidence-based scoring, adversarial baselines, per-type metrics,
versioned logs.

Deferred to "future vision" (not in the hackathon build): the custom multi-objective reward
(it may be reported as an extra metric only, never instead of the official one), the PPO/DQN
branch (its aggregated state such as `duplicate_candidates: 3` would leak the truth), SQLite or
PostgreSQL, Minari, Inspect AI, renamed actions (`inspect_invoice`, `record_type`), and the
8-week plan.
