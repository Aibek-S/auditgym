# MVP Scope

Status: proposal for review. **[OFFICIAL CASE]** marks mandatory requirements from the
case brief. Everything else is a proposal. Exact rules: [DECISIONS.md](DECISIONS.md);
interacting scenarios are I1/I2 from DECISIONS section 6 (the pair listed below is an early draft).

## 1. In scope (first working version)

### Generator
- Coherent hidden business history for NorthAngels for one month, generated from a seed and config.
  See [BUSINESS_MODEL.md](BUSINESS_MODEL.md). [OFFICIAL CASE]
- Accounting invariants verified **before** injecting errors (balanced ledger, invoice = payments + open balance).
- Four independently configurable error types (below). [OFFICIAL CASE]
- Two interacting-error scenarios. [OFFICIAL CASE] Proposed:
  1. *Partial payment in foreign currency at the period boundary* (example given in the brief):
     a partial-allocation error plus an FX date/rate error on the same payment near month-end.
  2. *Duplicate invoice whose copy is booked in the wrong period*: duplicate plus cutoff.
- Clean companies (0 errors) and legitimate distractors: split payments, combined payments,
  returns, legitimately repeated amounts. [OFFICIAL CASE]
- Recorded causal change per error (`provenance.json`) and ground truth (`truth.json`) with
  `issue_id, type, affected_ids, expected_amount_minor, currency` and acceptable evidence sets. [OFFICIAL CASE]
- Variation of names, IDs, order, amounts, currencies, timezones, and error combinations. [OFFICIAL CASE]
- Official open file formats exactly as specified in the brief. [OFFICIAL CASE]

### Environment
- `reset(seed, config) -> (observation, info)` and
  `step(action) -> (observation, reward, terminated, truncated, info)`, JSON-compatible. [OFFICIAL CASE]
- Actions `list_records`, `get_record`, `get_document`, `calculator`, `submit`; page size max 50; stable cursors. [OFFICIAL CASE]
- 100-step limit including submit, a time limit, bounded errors that consume a step. [OFFICIAL CASE]
- Open training mode (terminal reward returned) and closed evaluation mode (reward withheld). [OFFICIAL CASE]

### Evaluator
- One-to-one matcher, official P/R/F1, official terminal reward
  `R = clip(2*F1 - 1 - 0.002*inspection_steps, -1, 1)`. [OFFICIAL CASE]
- Published normalization, tolerance, and tie-breaking rules. [OFFICIAL CASE]
- Malformed submission -> reward -1, error logged on evaluator side. [OFFICIAL CASE]

### Deliverables [OFFICIAL CASE]
- Source with license and pinned dependencies; README with container instructions and a single check command.
- 10 train and 10 dev episodes; tests for environment, matcher, and reward (including attacks).
- Four baseline policy adapters: random explorer, simple reconciliation, flag-everything, oracle.
- `trajectories.jsonl` without hidden truth in observations; short design note; demo with a scripted policy.
- Offline run: no network, no paid APIs, no GPU. Target: Python 3.11, 2 CPU, 4 GB RAM, 60 s per episode.

## 2. Out of scope (first version)

- Training model weights, local LLMs, RL training loops (optional and worth no points by itself).
- Any UI beyond a CLI or simple demo output.
- Additional mandatory error types beyond the four official ones.
- Multiple entities, consolidation, VAT and taxes, inventory valuation, payroll, fixed assets,
  hedging, hyperinflation, rebates.
- Supplier invoice errors (accounts payable side). Recommended default; see OPEN_QUESTIONS B1.
- Real company data of any kind, including METRO's. [OFFICIAL CASE]
- LLM provider adapters as a mandatory part. The official check runs scripted policies offline.
  A provider-agnostic adapter interface is designed, but real LLM adapters are optional.

## 3. Future possibilities

- LLM agent adapters (OpenAI-compatible, local models) using the same action contract.
- Experimental extra reward, shown separately next to the official one (allowed by the brief).
- Purchase side errors (duplicate supplier invoice), bank-fee distractors, credit notes and rebates.
- Multi-period episodes, harder distractor curricula, difficulty levels in config.
- Controlled comparison on held-out data if model training is ever attempted. The brief forbids
  claiming improvement without it.

## 4. The four official error types

Detailed evidence and false positives are in [ERROR_SCENARIOS.md](ERROR_SCENARIOS.md).

| Type (proposed id) | Official name | Business meaning | Why detectable from available evidence |
|---|---|---|---|
| `duplicate_invoice` | Duplicate invoices | The same sale is invoiced and booked twice, so revenue and receivables are overstated. | Two invoice documents and ledger postings for one delivery: same customer, same line items, the second has no separate delivery and differs only in ID or date. Legitimate repeats have their own distinct lines or dates and their own payments. |
| `payment_allocation` | Missing or partial payment allocation | A received payment is not applied, or is applied only partly, to the invoice it settles. The invoice stays falsely open, or AR and cash do not tie. | `payments.jsonl` amount and `invoice_refs` vs ledger AR credits for that payment: the ledger credits less than (or none of) the paid amount, or the reference is missing although the payment matches the invoice. |
| `fx_conversion` | Wrong conversion date or rate | A foreign-currency amount is converted at a rate from the wrong date, or at a wrong rate, so the base-currency booking is wrong. | `fx.csv` + `policy.json` define the correct rate. The ledger KZT amount divided by the document amount gives the rate actually used. The calculator can show the difference. |
| `period_cutoff` | Reporting-period attribution error | Revenue or payment is recorded in the wrong period: goods delivered after period end but booked inside it, or the reverse. | `policy.json` boundaries + document timestamps (with timezone offsets) vs ledger row timestamps. |

Type id naming is open question C1. The official brief may define exact type strings.
If so, those strings win.

## 5. MVP build order (follows the brief's advice)

1. Contract (`reset`/`step`, file formats, matcher, reward) + `duplicate_invoice` + `payment_allocation`.
2. `fx_conversion`, `period_cutoff`, clean episodes, distractors.
3. Interacting scenarios, isolation hardening, attack tests, packaging.
