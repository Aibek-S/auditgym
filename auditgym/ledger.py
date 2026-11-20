"""Hidden history -> balanced KZT ledger events (DECISIONS section 3, D-10, D-11). Owner: Aibek.

The clerk follows `policy.json` unless the history carries an explicit booking decision
(`book_ts`, `book_rate_day`, `ar_override`), which is how errors are injected in #3.

Payment allocation rule (published in policy.json): payments are processed in time order;
each payment is applied to its `invoice_refs` in order, each invoice up to its open balance;
the remainder goes to 1900. A foreign invoice is relieved at its carrying KZT amount, pro rata
for partial settlements and the exact remainder on the final one; the difference between the
bank amount and AR relief goes to 7000.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from auditgym.history import History
from auditgym.money import prorate

BANK = {"KZT": "1010", "USD": "1020", "EUR": "1030"}


@dataclass
class Row:
    account: str
    debit: int
    credit: int
    entity: str | None  # internal customer key
    invoice: str | None  # internal invoice key
    payment: str | None  # internal payment key


@dataclass
class Event:
    ts: datetime
    kind: str
    rows: list[Row]
    ref: str | None = None  # internal key of the document that caused the event
    named: dict[str, int] = field(default_factory=dict)  # role -> index in rows (for truth/evidence)

    def check(self) -> None:
        debit = sum(r.debit for r in self.rows)
        credit = sum(r.credit for r in self.rows)
        if debit != credit:
            raise AssertionError(f"unbalanced event {self.kind} {self.ref}: {debit} != {credit}")


def build_ledger(h: History) -> list[Event]:
    events: list[Event] = []
    carrying: dict[str, int] = {}  # invoice key -> KZT carried in AR
    for inv in h.invoices.values():
        rate_day = inv.book_rate_day or h.local_day(inv.issued)
        kzt = h.fx.to_base(abs(inv.total_minor), inv.currency, rate_day)
        if inv.opening:
            events.append(Event(h.period_start, "opening", [
                Row("1200", kzt, 0, inv.customer, inv.key, None),
                Row("3900", 0, kzt, inv.customer, inv.key, None),
            ], inv.key, {"ar": 0, "opening": 1}))
            carrying[inv.key] = kzt
        elif inv.kind == "sale":
            events.append(Event(inv.book_ts or inv.issued, "sale", [
                Row("1200", kzt, 0, inv.customer, inv.key, None),
                Row("4000", 0, kzt, inv.customer, inv.key, None),
            ], inv.key, {"ar": 0, "revenue": 1}))
            carrying[inv.key] = kzt
        else:
            events.append(Event(inv.book_ts or inv.issued, "credit_note", [
                Row("4100", kzt, 0, inv.customer, inv.key, None),
                Row("1200", 0, kzt, inv.customer, inv.key, None),
            ], inv.key, {"returns": 0, "ar": 1}))

    # open balances in invoice currency, reduced by credit notes as of their date
    credit_notes = sorted((i for i in h.invoices.values() if i.kind == "credit_note"), key=lambda i: i.issued)
    open_doc = {k: i.total_minor for k, i in h.invoices.items() if i.kind == "sale"}
    relieved_doc = {k: 0 for k in open_doc}
    relieved_kzt = {k: 0 for k in open_doc}
    cn_index = 0

    for pay in sorted(h.payments.values(), key=lambda p: (p.ts, p.amount_minor, p.currency)):
        while cn_index < len(credit_notes) and credit_notes[cn_index].issued <= pay.ts:
            cn = credit_notes[cn_index]
            open_doc[cn.reverses] += cn.total_minor  # negative total
            cn_index += 1
        rate_day = pay.book_rate_day or h.local_day(pay.ts)
        bank = h.fx.to_base(pay.amount_minor, pay.currency, rate_day)
        remaining = pay.amount_minor
        credits: list[tuple[str, int]] = []
        for ref in pay.refs or []:
            inv = h.invoices[ref]
            if inv.currency != pay.currency:
                raise ValueError("cross-currency settlement is not modelled")
            part = min(open_doc[ref], remaining)
            if part <= 0:
                continue
            open_doc[ref] -= part
            remaining -= part
            relieved_doc[ref] += part
            if pay.currency == "KZT":
                ar = part
            elif open_doc[ref] == 0:
                ar = carrying[ref] - relieved_kzt[ref]
            else:
                ar = prorate(carrying[ref], relieved_doc[ref], inv.total_minor) - relieved_kzt[ref]
            relieved_kzt[ref] += ar
            credits.append((ref, ar))
        if pay.ar_override:
            credits = [(ref, pay.ar_override.get(ref, ar)) for ref, ar in credits]
        suspense = h.fx.to_base(remaining, pay.currency, rate_day) if remaining else 0
        if pay.currency == "KZT":
            suspense = bank - sum(a for _, a in credits)
        fx_diff = bank - sum(a for _, a in credits) - suspense

        rows = [Row(BANK[pay.currency], bank, 0, pay.customer, None, pay.key)]
        named = {"bank": 0}
        for ref, ar in credits:
            if ar == 0:  # a fully missing allocation has no AR row at all
                continue
            named[f"ar:{ref}"] = len(rows)
            rows.append(Row("1200", 0, ar, pay.customer, ref, pay.key))
        if suspense:
            named["suspense"] = len(rows)
            rows.append(Row("1900", 0, suspense, pay.customer, None, pay.key))
        if fx_diff:
            named["fx"] = len(rows)
            rows.append(Row("7000", max(0, -fx_diff), max(0, fx_diff), pay.customer, None, pay.key))
        events.append(Event(pay.ts, "receipt", rows, pay.key, named))

    for se in h.supplier_events:
        if se.kind == "purchase":
            rows = [Row("5000", se.amount_minor, 0, None, None, None), Row("2000", 0, se.amount_minor, None, None, None)]
        else:
            rows = [Row("2000", se.amount_minor, 0, None, None, None), Row("1010", 0, se.amount_minor, None, None, None)]
        events.append(Event(se.ts, se.kind, rows))

    for event in events:
        event.check()
    return events
