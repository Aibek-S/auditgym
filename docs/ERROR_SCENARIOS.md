# Error Scenarios

> **Superseded in details by [DECISIONS.md](DECISIONS.md) sections 5-7.** This file explains the
> business meaning and false positives. Exact ids, amounts, evidence sets, and the two interacting
> scenarios are defined in DECISIONS.md, which wins on any difference.

Status: proposal for review. The four types are the official mandatory ones [OFFICIAL CASE].
No other mandatory types are added. Type ids, `affected_ids` conventions, amount rules, and
evidence sets below are **proposals**. They become binding only once published with the
matcher code (the brief requires publishing normalization and tolerance rules).

General rules for every error [OFFICIAL CASE + proposal]:

- The error is injected into a **consistent hidden history**. The causal change is recorded
  in `provenance.json` as before value, after value, and records touched.
- Ground truth describes the **real discrepancy**, not "a suspicious row".
- Every acceptable evidence set consists only of records the agent can open.
  The generator verifies this before an episode is accepted.
- `expected_amount_minor` is the size of the misstatement, in the stated currency, in minor units.
- No error may require an unavailable fact, for example a delivery that exists only in the hidden history.

Notation in examples: amounts in major units for readability; real files use minor units.

---

## 1. Duplicate invoice (`duplicate_invoice`)

**Business meaning.** One delivery to a customer is invoiced and booked twice.
Revenue and receivables are overstated by the duplicate amount. The customer will pay once,
so a phantom receivable remains.

**How it happens.** An invoice is re-issued after a system timeout, a delivery driver and the
office both raise an invoice, or an invoice is re-entered after a correction without voiding the original.

**Revealing records.**
- `invoices.jsonl`: two invoices, same `entity_id`, same `line_items` including the same
  order/delivery reference (see open question C3), same currency and total, different
  `invoice_id`/`doc_id`, close `issued_at`.
- `ledger.csv`: two AR/revenue postings, one per invoice id.
- `payments.jsonl`: typically one payment covering only one of them.

**Evidence to collect.** Both invoice documents (proof of identical content) + the ledger revenue
row of the duplicate (proof it was booked).

**Correct finding (proposal).**
```json
{"type": "duplicate_invoice", "affected_ids": ["INV-A", "INV-B"], "claimed_amount_minor": 4500000,
 "currency": "KZT", "evidence_ids": ["DOC-A", "DOC-B", "L-0207"],
 "explanation": "INV-B repeats INV-A (same customer, lines, delivery ref) and is booked as revenue."}
```
Canonical `affected_ids`: **both** invoice ids, compared as a set (D-33). Amount: KZT booked
for the copy (D-31: every finding amount is in KZT).

**False positives to design for (distractors).**
- Recurring weekly orders: same customer, same total, but different delivery references and dates,
  each with its own payment.
- Two different customers with identical totals.
- A credit note reversing an invoice followed by a corrected re-issue. This is legitimate if the
  reversal is present.

---

## 2. Missing or partial payment allocation (`payment_allocation`)

**Business meaning.** Cash was received, but the payment is not applied, or only partly applied,
to the invoice it settles. The invoice looks overdue or partly unpaid, AR is overstated, and the
excess sits unallocated.

**How it happens.** Manual allocation stops after the first invoice of a combined payment. A bank
reference is missing, so the payment goes to a suspense account. A typo in the allocated amount.

**Revealing records.**
- `payments.jsonl`: `amount_minor` and `invoice_refs`.
- `ledger.csv`: AR credit rows with that `payment_id` sum to **less** than the payment amount
  (converted if needed).
- `invoices.jsonl`: invoice total showing the invoice would be fully settled by the payment.

**Evidence to collect.** Payment document + invoice document + the ledger rows of the payment
(or proof of the missing row, see below).

**Correct finding (proposal).** `affected_ids`: `[payment_id, invoice_id]`. Amount: the
unallocated part in KZT, i.e. the amount credited to `1900` instead of AR (D-31).

**Evidence subtlety.** "A ledger row is missing" cannot be proven by pointing at a row. Proposed
acceptable evidence: payment doc + invoice doc + the bank (cash) ledger row of that payment, which
exists and shows the full amount, while the AR credit is short or absent. Open question D1.

**False positives.**
- Legitimate split payment: the invoice is settled by two payments; each one alone looks partial.
- Combined payment covering several invoices: correctly allocated across all of them.
- Genuinely partially paid invoice: the customer paid less. The ledger is correct and the invoice
  is still open. This is **not** an error.
- Payment in another currency: the allocated amount differs nominally but matches after conversion.

---

## 3. Wrong conversion date or rate (`fx_conversion`)

**Business meaning.** A USD/EUR invoice or payment is booked in KZT using a rate from the wrong
date, the inverse rate, or a wrong rate. Revenue, AR, or FX gain/loss is misstated.

**How it happens.** The bookkeeper uses the payment date rate for the invoice, the rate of the
previous day, or the rate of the timestamp in UTC instead of the local date.

**Revealing records.**
- Document (invoice or payment) with foreign `currency`, `total_minor`/`amount_minor`, and timestamp.
- `policy.json`: which date's rate applies.
- `fx.csv`: the correct rate row and the wrongly used rate row.
- `ledger.csv`: the KZT amount actually booked. The implied rate is booked KZT / foreign amount.

**Evidence to collect.** The document + the correct `fx` row + the ledger row. The `calculator`
result is not evidence by itself.

**Correct finding (proposal).** `affected_ids`: `[invoice_id or payment_id]`. Amount: absolute
difference between booked and correct base-currency amount, in **base currency (KZT)**.
Tolerance: plus or minus 1 minor unit for rounding (open question G2).

Example: invoice 1,000.00 EUR on 2026-10-14. Policy: issue date rate. `fx` on 2026-10-14 says
`"552.10"`, so the correct value is 552,100.00 KZT. The ledger booked 549,300.00 KZT, which is
the 2026-10-10 rate `"549.30"`. Misstatement: 2,800.00 KZT -> `claimed_amount_minor: 280000`, `currency: "KZT"`.

**False positives.**
- Realised FX gain/loss on payment: different rates at invoice and payment date are **correct**
  and produce a legitimate `7000 FX Gain/Loss` row.
- Weekend or holiday with no rate: policy says "use last available rate". Using Friday's rate is correct.
- Timestamp near midnight with a UTC offset: the local date determines the rate.
- Rounding differences within tolerance.

---

## 4. Reporting-period attribution error (`period_cutoff`)

**Business meaning.** A transaction is booked in the wrong reporting period. Example: goods
delivered on 2 November are recognised as October revenue (overstating October), or an October
delivery is booked in November (understating October).

**How it happens.** Pressure to hit monthly targets, invoices dated at order instead of delivery,
or the UTC vs local time confusion at midnight on the last day.

**Revealing records.**
- `policy.json`: period start/end and timezone, and the event that determines the period
  (proposal: invoice `issued_at` = transfer of control; open question B4).
- Invoice document with `issued_at` outside the period.
- `ledger.csv` revenue row with timestamp inside the period (or the reverse).

**Evidence to collect.** Invoice doc + the misdated ledger rows. `policy` is part of the first
observation, so it does not need to be cited.

**Correct finding (proposal).** `affected_ids`: `[invoice_id]`. Amount: amount misattributed in
base currency. Currency: KZT.

**False positives.**
- Invoice at `2026-10-31T23:40:00+05:00` booked in October: correct, because it is local time.
- Payment received in November for an October invoice: correct, because payment timing is not revenue timing.
- Advance payment received before period end for a November delivery: correct if booked to
  `2100 Customer Advances`, not revenue.

---

## 5. Interacting scenarios (two required) [OFFICIAL CASE]

> **Replaced by DECISIONS.md section 6.** Final choice: **I1** = FX invoice at the period boundary
> (`period_cutoff` + `fx_conversion` from one UTC-date mistake, with a legitimate partial payment
> as a distractor); **I2** = `duplicate_invoice` + `payment_allocation` on the same invoice.
> The early drafts below are kept only for history.

**I1. Partial foreign-currency payment at the period boundary.** A USD payment dated on the night
of the last day (UTC timestamp, next local day) partially settles a USD invoice. It is allocated
short **and** converted at the wrong date's rate. Ground truth: **two** issues
(`payment_allocation` + `fx_conversion`) sharing records. Each has its own amount and evidence.
The agent must not merge them into one finding.

**I2. Duplicate invoice booked across the period boundary.** The duplicate copy of an October
invoice carries a November `issued_at` but is booked in October. Ground truth: `duplicate_invoice`
+ `period_cutoff` on the same invoice id.

Design rule: in interacting scenarios each issue must still be **independently provable**,
and amounts must be defined so that fixing one does not change the other's expected amount.
Otherwise matching is ambiguous. The exact order of application is recorded in `provenance.json`.

## 6. Clean episodes and distractor checklist

Clean episodes contain **no** injected error, but still contain distractors. The truth file is
empty, and the correct answer is an empty findings list (F1 = 1 by the official rule).

Distractors (all must be internally consistent): split payments, combined payments, partial-but-open
invoices, legitimate recurring amounts, returns, realised FX differences, weekend rates, invoices near
local midnight, and advance payments.
