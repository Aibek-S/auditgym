# Business Model: NorthAngels FoodService Ltd.

Status: proposal for review. Everything in this document is a design **[ASSUMPTION]**
unless marked otherwise. METRO facts it is inspired by are referenced as F-numbers from
[CASE_OVERVIEW.md](CASE_OVERVIEW.md).

> Exact rules (timezone as fixed `+05:00`, ledger always in KZT, accounts, opening balances,
> credit notes, delivery notes) are fixed in [DECISIONS.md](DECISIONS.md) sections 1-4,
> which wins on any difference.

Design goal: realistic enough that the four official error types and the legitimate
distractors arise naturally; small enough to generate, verify, and explain in 3 days.

## 1. Company profile

| Item | Proposal |
|---|---|
| Legal form | Single fictional legal entity, no subsidiaries |
| Activity | Wholesale and delivery of food and non-food goods to professional customers (F3-F7) |
| Location | Fictional city in Kazakhstan |
| Base currency | KZT (exponent 2: 1 KZT = 100 tiyn) |
| Other currencies | USD (exponent 2), EUR (exponent 2) |
| Timezone | fixed offset `+05:00` in manifest (D-05); some documents carry `+00:00` (see section 10) |
| Reporting period | One calendar month per episode |
| Size per episode | Within official range: 200-2,000 ledger rows, 20-200 documents, 0-12 errors |

## 2. Suppliers (purchase side)

- Domestic suppliers (KZT): dairy, bakery, vegetables, beverages, cleaning supplies.
- International suppliers (USD/EUR): coffee, cheese, olive oil, kitchen equipment.
- Terms: payment 14-30 days after supplier invoice.

MVP note: whether supplier invoices are generated at all is open question B1. The official
file `invoices.jsonl` has no direction field (sales vs purchase). The **recommended default
is sales side only** for the MVP. Purchases are then reflected only as aggregate ledger
rows (for realism and volume), not as documents with errors.

## 3. Customers (sales side)

| Segment | Examples (fictional) | Share | Typical currency | Typical pattern |
|---|---|---|---|---|
| HoReCa - restaurants, cafes | "Cafe Sary", "Bistro Oral" | high | KZT | weekly recurring orders, similar amounts |
| HoReCa - hotels, catering | "Hotel Steppe Garden" | medium | KZT, sometimes USD | larger invoices, split payments |
| Traders - kiosks, small shops | "Mini-market 24" | medium | KZT | small invoices, combined payments |
| Foreign / chain customers | "Silk Route Catering GmbH" | low | EUR / USD | FX conversion required |

Inspired by F4-F5. Names are generated per episode and randomized.

## 4. Products

Product categories only appear as invoice `line_items` (description, quantity, unit price,
line total). There is **no inventory accounting** (no stock levels, no cost of goods sold
per item). Categories: fresh, frozen, dry goods, beverages, near-food (cleaning), non-food
(kitchen equipment). Inspired by F6.

## 5. Sales channels

1. **Cash & carry (wholesale pick-up).** Customer collects goods. Invoice issued at pick-up.
   Mostly paid immediately or within a few days.
2. **Delivery.** Scheduled delivery to the customer site. Invoice issued at or after
   delivery. Credit terms 7-30 days.

Inspired by F3 and F7. For the MVP the channel is only metadata. It affects realistic timing,
for example delivery dates near month-end creating cutoff situations. It needs no separate documents.

## 6. Normal business flow (no errors)

```text
Customer order
   -> goods picked up or delivered          (transfer of control = revenue date, F9)
   -> sales invoice issued                  (invoices.jsonl)
   -> ledger: Dr Accounts Receivable / Cr Revenue      (ledger.csv)
   -> customer pays, fully or in parts       (payments.jsonl, invoice_refs)
   -> ledger: Dr Bank / Cr Accounts Receivable
   -> if foreign currency: convert at the policy rate (fx.csv, policy.json);
      difference between invoice-date and payment-date value -> FX gain/loss
   -> optional legitimate events: return/credit note, overpayment refund
```

Invariant before any error is injected (this is what the jury checks as "accounting
equalities"):

- every ledger transaction balances (sum of debits = sum of credits, in base currency);
- for each invoice: invoice total = sum of allocated payments + open balance;
- AR balance in ledger = sum of open invoice balances (converted per policy);
- revenue in the period = sum of invoices whose transfer-of-control date is in the period.

## 7. Invoices

Sales invoice fields follow the official format exactly [OFFICIAL CASE]:
`doc_id, invoice_id, entity_id, issued_at, due_at, currency, total_minor, line_items`.

Proposed realism rules:

- `total_minor` = sum of line totals (integer minor units, no floats).
- Recurring customers receive invoices with identical totals on different dates
  (legitimate repetition, a distractor for duplicate detection).
- Credit notes for returns: open question B3 (separate doc vs negative invoice).

## 8. Payments

Official fields: `doc_id, payment_id, timestamp, currency, amount_minor, invoice_refs`.

Legitimate patterns that must exist as distractors:

- one payment -> one invoice, full amount;
- several payments -> one invoice (split payment, sums to total);
- one payment -> several invoices (combined payment);
- payment in a currency different from the invoice (converted per policy);
- overpayment followed by a refund.

`invoice_refs` must be an explicit list. An unallocated payment has an empty list or `null`,
never a guessed link [OFFICIAL CASE]. Open question E2 covers how per-invoice allocated
amounts are represented.

## 9. Financial records (open files)

| File | Content | Source of requirement |
|---|---|---|
| `manifest.json` | schema version, episode id, base currency, period, timezone, counts, rounding | [OFFICIAL CASE] |
| `ledger.csv` | double-entry rows | [OFFICIAL CASE] |
| `invoices.jsonl` | sales invoices | [OFFICIAL CASE] |
| `payments.jsonl` | customer payments | [OFFICIAL CASE] |
| `fx.csv` | daily rates for USD/KZT, EUR/KZT (and possibly cross) | [OFFICIAL CASE] |
| `policy.json` | which rate date to use, period boundary, rounding | [OFFICIAL CASE] |

Proposed minimal chart of accounts [ASSUMPTION]:

| Account | Meaning |
|---|---|
| `1010 Bank KZT`, `1020 Bank USD`, `1030 Bank EUR` | cash at bank |
| `1200 Accounts Receivable` | amounts customers owe |
| `2000 Accounts Payable` | amounts owed to suppliers (aggregate only in MVP) |
| `2100 Customer Advances / Deferred Revenue` | goods paid or invoiced before transfer of control |
| `4000 Revenue` | sales |
| `4100 Sales Returns` | legitimate returns |
| `5000 Purchases / COGS` | aggregate purchase cost (MVP: aggregate) |
| `7000 FX Gain/Loss` | realised exchange differences |

Illustrative ledger rows (not a dataset, just the shape):

```text
row_id  timestamp                  account  debit_minor credit_minor currency entity_id invoice_id payment_id
L-0101  2026-10-03T10:15:00+05:00  1200     4500000     0            KZT      C-17      INV-301    null
L-0102  2026-10-03T10:15:00+05:00  4000     0           4500000      KZT      C-17      INV-301    null
```

## 10. Currencies, rates, and time

- Money is stored as integer minor units plus the currency's exponent [OFFICIAL CASE].
- FX rates are decimal strings [OFFICIAL CASE], for example `"481.25"` KZT per USD.
- Amounts in different currencies are never compared without conversion [OFFICIAL CASE].
- Proposed policy default: convert at the rate of the **transaction date in the company
  timezone**. Revenue uses the invoice (transfer of control) date. Payment uses the payment date.
  The difference creates an FX gain or loss. Rounding: half-up to the minor unit, after conversion.
- Timestamps are ISO-8601 with offset. Some payments carry the bank's offset (for example
  `+00:00`). A payment at `2026-10-31T21:30:00+00:00` is actually 1 November in Almaty.
  This deliberately tests timezone-aware cutoff and rate-date selection.

## 11. Accounting period

- Episode = one company, one period (one month) [OFFICIAL CASE for "one period"].
- Records include a few days before the period start and after its end (for example +/- 5 days).
  This gives the cutoff evidence: a delivery dated 2 November whose revenue was booked on 31 October.
- Opening balances: open question A2 (recommended: a small set of opening AR invoices from
  the previous month, so partial payments of old invoices can appear).

## 12. Deliberately excluded complexity

Subsidiaries and consolidation, VAT and other taxes, inventory valuation, payroll, fixed
assets, hyperinflation accounting, hedging, rebates and loyalty programs, bank fees
(possible future distractor). See [SCOPE.md](SCOPE.md).
