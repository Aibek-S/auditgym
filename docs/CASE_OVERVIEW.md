# Case Overview

Status: proposal for review. Labels used in this document:

- **[VERIFIED]** - stated in an official METRO source listed in [REFERENCES.md](REFERENCES.md).
- **[OFFICIAL CASE]** - mandatory requirement from the hackathon case brief.
- **[ASSUMPTION]** - our own design decision or simplification, not yet approved.

## 1. Why a real-world reference at all

The case requires a "coherent hidden company history" from which documents and errors
are derived [OFFICIAL CASE]. Basing that history on a real, publicly documented business
model gives us realistic document types, customer types, and money flows without
inventing an economy from scratch. It also makes the demo easier to explain to the jury.

## 2. METRO AG: publicly verified facts

Source: METRO Annual Report 2023/24, combined management report, "Business model",
plus "Goals and strategy" and the notes on revenue recognition and currency translation
(see [REFERENCES.md](REFERENCES.md), R1-R4).

| # | Fact | Label |
|---|---|---|
| F1 | METRO is a leading international food wholesaler doing business in 33 countries. | [VERIFIED] R1 |
| F2 | METRO AG is the central management holding company of the group. | [VERIFIED] R1 |
| F3 | The strategy is multichannel: wholesale stores (around 74% sales share in 2023/24), delivery business, and digital solutions. | [VERIFIED] R1 |
| F4 | The business is aimed at professional customers; HoReCa and Traders are core customer groups. | [VERIFIED] R1 |
| F5 | HoReCa = hotels, restaurants, catering, bars, cafes, canteen operators. Traders = independent resellers such as small grocery stores, kiosks, street food vendors, gas stations, wholesalers. | [VERIFIED] R1 glossary |
| F6 | Assortment comprises food (fresh, durable, frozen, drinks, near-food such as cleaning agents) and non-food items. | [VERIFIED] R1 glossary |
| F7 | Food Service Distribution (FSD) supplies selected professional customers by delivery based on commercial and service agreements. | [VERIFIED] R1 |
| F8 | METRO operates 6 stores in Kazakhstan (store network as of 30/9/2024). | [VERIFIED] R1 table |
| F9 | Revenue is recognised (IFRS 15) when control of goods transfers to the customer; for store and delivery business, cash payment or payment shortly after delivery (credit purchase) is usually agreed. | [VERIFIED] R3 |
| F10 | Customers may have rights to return or exchange goods; volume and loyalty rebates exist. | [VERIFIED] R3 |
| F11 | Gains and losses from exchange-rate fluctuations on foreign currency transactions are in principle recognised in profit or loss. | [VERIFIED] R4 |
| F12 | sCore strategy targets an FSD sales share above 33% and a digital sales share of 40% by 2030. | [VERIFIED] R2 |

Note: the corporate page `metroag.de/about-us` returned HTTP 403 (bot protection) during
research, so no facts are taken from it. All facts above come from the annual report site.

## 3. The fictional company: NorthAngels FoodService Ltd.

**NorthAngels FoodService Ltd.** ("NorthAngels") is a fictional, single-entity food
wholesaler and foodservice distributor [ASSUMPTION]. It is *inspired by* facts F3-F7 and
F9-F10. It does not use any METRO names, figures, customers, suppliers, or transactions.

What we take from METRO (inspiration):

- B2B-only customers: HoReCa and independent traders (F4, F5).
- Two sales channels: wholesale pick-up ("cash & carry") and scheduled delivery (F3, F7).
- Food and non-food assortment (F6).
- Short credit terms after delivery; revenue at transfer of control (F9).
- Returns and rebates exist as normal business events (F10). We use returns as
  legitimate distractors; rebates are out of scope for the MVP.

What is our own [ASSUMPTION]:

- One legal entity, no subsidiaries, no consolidation, no hyperinflation accounting.
- Base (functional) currency KZT; transactions in KZT, USD, EUR. This mirrors the fact that
  METRO operates in Kazakhstan (F8) but is not a claim about METRO Kazakhstan's books.
- Imports from foreign suppliers in USD/EUR; most customers pay in KZT, a minority of
  export or hotel-chain customers invoiced in USD/EUR.
- Simplified chart of accounts, no tax (VAT out of scope), no inventory valuation.
- One reporting period per episode (proposed: one calendar month).
- All names, IDs, amounts, and dates are generated; all data is fictional [OFFICIAL CASE].

## 4. Why this business model suits a financial audit environment

- **All four official error types occur naturally.**
  Many recurring invoices to the same customers make duplicates plausible. Credit sales
  with split and short payments make partial-payment errors plausible. Foreign-currency
  purchases and sales make FX date/rate errors plausible. Delivery near month-end makes
  cutoff errors plausible.
- **Natural legitimate distractors exist.** Recurring weekly orders with identical amounts,
  payments split across several transfers, one payment covering several invoices, and
  customer returns all look suspicious but are correct. The case explicitly asks for these
  [OFFICIAL CASE].
- **The evidence is checkable from documents alone.** Invoice, payment, ledger, and FX table
  together are enough to prove or disprove each error. No external facts are needed.
- **It is simple.** Trading company, no manufacturing, no payroll, no fixed assets needed.

## 5. Risks of the reference choice

- The jury does not score realism directly. METRO is a framing aid, not a scoring factor.
  Time spent on realism beyond the four error types has low return.
- Using a real company's name could suggest real data. Mitigation: state in README, design
  note, and demo that METRO is only a business-model reference and all data is synthetic.
- Purchase side (supplier invoices, accounts payable) is realistic but not required by the
  official file formats, which describe invoices and payments generically. Whether to model
  purchases in the MVP is an open question (see [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) B1).
