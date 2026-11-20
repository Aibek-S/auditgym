"""Build the three hand-designed fixture episodes for issue #1.

Every invoice, payment, and posting is listed by hand in `build_base`,
`build_duplicate`, and `build_allocation`. This script only does the arithmetic
(totals, FX conversion) and the serialization, so amounts are exact and the
output is byte-identical on every run:

    python3 tests/fixtures/build_fixtures.py

This is NOT the generator (issue #2). It exists so the environment and matcher
(#4, #5) can be built before the generator is ready.
"""

from __future__ import annotations

import csv
import json
import random
import string
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE  # tests may point this at a temp dir to check reproducibility
LOCAL = timezone(timedelta(hours=5))
UTC = timezone.utc
PERIOD_START = datetime(2026, 9, 1, tzinfo=LOCAL)
PERIOD_END = datetime(2026, 10, 1, tzinfo=LOCAL)  # exclusive
FX_FROM = date(2026, 8, 22)
FX_TO = date(2026, 10, 6)  # period end + 5-day cutoff window

SCHEMA_VERSION = "1.0"
DECISIONS_VERSION = "decisions-v0.1"

# sku, description, alternative wording used by duplicate copies (D-14a), KZT unit price
CATALOG = {
    "MILK": ("MILK-32-1L", "Milk 3.2% 1L", "Milk 3,2 % 1 l", 450_00),
    "BREAD": ("BREAD-WHT", "White bread loaf", "Bread white, loaf", 250_00),
    "COFFEE": ("COFFEE-1KG", "Coffee beans 1 kg", "Coffee, beans, 1kg", 9800_00),
    "OIL": ("OIL-OLV-5L", "Olive oil 5 L", "Oil olive 5l", 12500_00),
    "CHEESE": ("CHEESE-PRM", "Parmesan 1 kg", "Parmesan cheese 1kg", 14200_00),
    "DETERG": ("DETERG-5L", "Dish detergent 5 L", "Detergent dish 5l", 3900_00),
}

POLICY = {
    "period_basis": "invoice issued_at, local date (+05:00) = transfer of control",
    "fx_rate_date": "local date (+05:00) of the document timestamp",
    "fx_missing_rate": "last available rate before that date",
    "fx_conversion": "target_minor = round_half_up(source_minor * rate), once per document amount",
    "foreign_invoice_settlement": "AR relieved at carrying amount; difference to account 7000",
    "unallocated_receipts_account": "1900",
    "amount_currency_for_findings": "KZT",
    "amount_tolerance_minor": 100,
}

LEDGER_COLUMNS = [
    "row_id", "timestamp", "account", "debit_minor", "credit_minor",
    "currency", "entity_id", "invoice_id", "payment_id",
]


def at(y, mo, d, h, mi) -> datetime:
    return datetime(y, mo, d, h, mi, tzinfo=LOCAL)


def iso(ts: datetime, offset_hours: int) -> str:
    return ts.astimezone(timezone(timedelta(hours=offset_hours))).isoformat()


def build_fx():
    rng = random.Random("fixture:fx")
    rates = {"USD": Decimal("478.40"), "EUR": Decimal("551.90")}
    rows = []
    day = FX_FROM
    while day <= FX_TO:
        if day.weekday() < 5:  # business days only (D-18)
            for cur in ("USD", "EUR"):
                rows.append((day, cur, "KZT", rates[cur]))
                rates[cur] += Decimal(rng.randint(-120, 120)) / 100
        day += timedelta(days=1)
    return rows


FX_ROWS = build_fx()


def rate_on(currency: str, local_day: date) -> tuple[Decimal, str]:
    """Last available rate on or before the local date (policy fx_missing_rate)."""
    best = None
    for d, src, _tgt, rate in FX_ROWS:
        if src == currency and d <= local_day:
            best = (rate, f"{d.isoformat()}:{src}:KZT")
    assert best is not None, (currency, local_day)
    return best


def to_kzt(amount_minor: int, currency: str, ts: datetime) -> int:
    if currency == "KZT":
        return amount_minor
    rate, _ = rate_on(currency, ts.astimezone(LOCAL).date())
    return int((Decimal(amount_minor) * rate).quantize(Decimal(1), rounding=ROUND_HALF_UP))


class Episode:
    def __init__(self, name: str):
        self.name = name
        self.rng = random.Random(f"fixture:{name}:ids")
        self.used: set[str] = set()
        self.episode_id = "".join(self.rng.choice("0123456789abcdef") for _ in range(16))
        self.invoices: list[tuple[datetime, float, dict]] = []
        self.payments: list[tuple[datetime, float, dict]] = []
        self.ledger: list[tuple[tuple, dict]] = []
        self.meta: dict[str, dict] = {}  # invoice_id -> {"issued": dt, "kzt": int}
        self.issues: list[dict] = []
        self.changes: list[dict] = []

    # ids (D-41: random, no pattern that marks injected records)
    def new_id(self, prefix: str, n: int = 6) -> str:
        alphabet = string.ascii_uppercase + string.digits
        while True:
            value = f"{prefix}-" + "".join(self.rng.choice(alphabet) for _ in range(n))
            if value not in self.used:
                self.used.add(value)
                return value

    # documents
    def line(self, dn, key, qty, price=None, alt=False, ref=None):
        sku, desc, alt_desc, kzt_price = CATALOG[key]
        return (dn, sku, alt_desc if alt else desc, qty, kzt_price if price is None else price, ref)

    def invoice(self, entity, issued, currency, lines, offset=5, due_days=14, description=None):
        inv_id, doc_id = self.new_id("INV"), self.new_id("DOC")
        items = []
        for i, (dn, sku, desc, qty, price, ref) in enumerate(lines, 1):
            items.append({
                "line_no": i, "sku": sku, "description": description or desc,
                "quantity": qty, "unit_price_minor": price, "amount_minor": qty * price,
                "delivery_note_id": dn, "ref_invoice_id": ref,
            })
        rec = {
            "doc_id": doc_id, "invoice_id": inv_id, "entity_id": entity,
            "issued_at": iso(issued, offset), "due_at": iso(issued + timedelta(days=due_days), offset),
            "currency": currency, "total_minor": sum(it["amount_minor"] for it in items),
            "line_items": items,
        }
        self.invoices.append((issued, self.rng.random(), rec))
        self.meta[inv_id] = {"issued": issued, "kzt": to_kzt(abs(rec["total_minor"]), currency, issued), "rec": rec}
        return rec

    def post(self, ts, rows):
        """rows: (account, debit, credit, entity, invoice_id, payment_id). Returns row ids."""
        assert sum(r[1] for r in rows) == sum(r[2] for r in rows), rows
        tie = self.rng.random()
        ids = []
        for k, (acc, dr, cr, ent, inv, pay) in enumerate(rows):
            rid = self.new_id("L")
            self.ledger.append(((ts, tie, k), {
                "row_id": rid, "timestamp": iso(ts, 5), "account": acc,
                "debit_minor": dr, "credit_minor": cr, "currency": "KZT",
                "entity_id": ent, "invoice_id": inv, "payment_id": pay,
            }))
            ids.append(rid)
        return ids

    def book_sale(self, rec, ts=None):
        m = self.meta[rec["invoice_id"]]
        ar, rev = self.post(ts or m["issued"], [
            ("1200", m["kzt"], 0, rec["entity_id"], rec["invoice_id"], None),
            ("4000", 0, m["kzt"], rec["entity_id"], rec["invoice_id"], None),
        ])
        return {"ar": ar, "revenue": rev}

    def book_credit_note(self, rec):
        m = self.meta[rec["invoice_id"]]
        self.post(m["issued"], [
            ("4100", m["kzt"], 0, rec["entity_id"], rec["invoice_id"], None),
            ("1200", 0, m["kzt"], rec["entity_id"], rec["invoice_id"], None),
        ])

    def book_opening(self, rec):
        m = self.meta[rec["invoice_id"]]
        self.post(PERIOD_START, [
            ("1200", m["kzt"], 0, rec["entity_id"], rec["invoice_id"], None),
            ("3900", 0, m["kzt"], rec["entity_id"], rec["invoice_id"], None),
        ])

    def payment(self, entity, ts, currency, alloc, refs="from_alloc", to_suspense=0,
                ar_override=None, offset=5):
        """alloc: [(invoice_rec, amount in payment currency)] actually paid for each invoice.

        ar_override: {invoice_id: KZT amount credited to AR} -- only used to inject an
        allocation error; the difference goes to 1900.
        """
        pay_id, doc_id = self.new_id("PAY"), self.new_id("DOC")
        amount = sum(a for _, a in alloc) + to_suspense
        if refs == "from_alloc":
            refs = [r["invoice_id"] for r, _ in alloc]
        rec = {
            "doc_id": doc_id, "payment_id": pay_id, "timestamp": iso(ts, offset),
            "currency": currency, "amount_minor": amount, "invoice_refs": refs,
        }
        self.payments.append((ts, self.rng.random(), rec))

        bank_acc = {"KZT": "1010", "USD": "1020", "EUR": "1030"}[currency]
        bank = to_kzt(amount, currency, ts)
        credits = []
        for inv, part in alloc:
            m = self.meta[inv["invoice_id"]]
            if currency == "KZT":
                kzt = part
            else:  # foreign invoices are settled in full at carrying amount (fixtures only)
                assert part == inv["total_minor"]
                kzt = m["kzt"]
            if ar_override and inv["invoice_id"] in ar_override:
                kzt = ar_override[inv["invoice_id"]]
            credits.append((inv["invoice_id"], kzt))
        suspense = bank - sum(k for _, k in credits) if currency == "KZT" else to_kzt(to_suspense, currency, ts)
        fx_diff = bank - sum(k for _, k in credits) - suspense

        rows = [(bank_acc, bank, 0, entity, None, pay_id)]
        rows += [("1200", 0, k, entity, inv_id, pay_id) for inv_id, k in credits]
        if suspense:
            rows.append(("1900", 0, suspense, entity, None, pay_id))
        if fx_diff > 0:
            rows.append(("7000", 0, fx_diff, entity, None, pay_id))
        elif fx_diff < 0:
            rows.append(("7000", -fx_diff, 0, entity, None, pay_id))
        row_ids = self.post(ts, rows)
        named = {"bank": row_ids[0], "ar": row_ids[1:1 + len(credits)]}
        if suspense:
            named["suspense"] = row_ids[1 + len(credits)]
        return rec, named

    def purchase(self, ts, amount):
        self.post(ts, [("5000", amount, 0, None, None, None), ("2000", 0, amount, None, None, None)])

    def supplier_payment(self, ts, amount):
        self.post(ts, [("2000", amount, 0, None, None, None), ("1010", 0, amount, None, None, None)])

    # output
    def write(self):
        out = OUT / self.name
        (out / "public").mkdir(parents=True, exist_ok=True)
        (out / "private").mkdir(parents=True, exist_ok=True)
        invoices = [r for _, _, r in sorted(self.invoices, key=lambda x: (x[0], x[1]))]
        payments = [r for _, _, r in sorted(self.payments, key=lambda x: (x[0], x[1]))]
        ledger = [r for _, r in sorted(self.ledger, key=lambda x: x[0])]

        manifest = {
            "schema_version": SCHEMA_VERSION,
            "episode_id": self.episode_id,
            "base_currency": "KZT",
            "period_start": PERIOD_START.isoformat(),
            "period_end": PERIOD_END.isoformat(),
            "timezone": "+05:00",
            "currency_exponents": {"KZT": 2, "USD": 2, "EUR": 2},
            "counts": {
                "ledger": len(ledger), "invoices": len(invoices), "payments": len(payments),
                "fx": len(FX_ROWS), "documents": len(invoices) + len(payments),
            },
            "rounding": "half_up",
        }
        write_json(out / "public/manifest.json", manifest)
        write_json(out / "public/policy.json", POLICY)
        write_jsonl(out / "public/invoices.jsonl", invoices)
        write_jsonl(out / "public/payments.jsonl", payments)
        with open(out / "public/ledger.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f, lineterminator="\n")
            w.writerow(LEDGER_COLUMNS)
            for r in ledger:
                w.writerow(["" if r[c] is None else r[c] for c in LEDGER_COLUMNS])
        with open(out / "public/fx.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f, lineterminator="\n")
            w.writerow(["date", "source_currency", "target_currency", "rate"])
            for d, src, tgt, rate in FX_ROWS:
                w.writerow([d.isoformat(), src, tgt, f"{rate:.2f}"])

        write_json(out / "private/truth.json", {
            "schema_version": SCHEMA_VERSION, "episode_id": self.episode_id, "issues": self.issues,
        })
        write_json(out / "private/provenance.json", {
            "episode_id": self.episode_id, "source": "hand-designed fixture (issue #1)",
            "decisions_version": DECISIONS_VERSION, "changes": self.changes,
        })
        write_json(out / "private/seed_config.json", {
            "seed": None, "config_id": "fixture", "fixture": self.name,
            "builder": "tests/fixtures/build_fixtures.py", "decisions_version": DECISIONS_VERSION,
        })


def write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows) -> None:
    path.write_text(
        "".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n" for r in rows),
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Scenarios (hand-designed)
# ---------------------------------------------------------------------------

def build_base(ep: Episode) -> dict:
    """Clean September 2026 for NorthAngels with every legitimate distractor (DECISIONS section 7)."""
    c = {k: ep.new_id("C", 4) for k in ("cafe", "bistro", "hotel", "foreign", "kiosk", "canteen", "bar")}
    dn = lambda: ep.new_id("DN", 5)  # noqa: E731
    h = {"c": c}

    # Opening balance: August invoice, paid in September (D-17)
    d = dn()
    h["open"] = ep.invoice(c["hotel"], at(2026, 8, 27, 11, 0), "KZT", [ep.line(d, "OIL", 6), ep.line(d, "CHEESE", 5)])
    ep.book_opening(h["open"])
    ep.payment(c["hotel"], at(2026, 9, 4, 10, 5), "KZT", [(h["open"], h["open"]["total_minor"])])

    # Aggregate purchases (no documents, D-02)
    ep.purchase(at(2026, 9, 5, 12, 0), 18_500_000)
    ep.supplier_payment(at(2026, 9, 20, 12, 0), 18_500_000)

    # Distractor: recurring weekly order, same lines and total, NEW delivery note each time,
    # settled by one combined payment
    weekly = []
    for day in (7, 14):
        d = dn()
        inv = ep.invoice(c["cafe"], at(2026, 9, day, 9, 30), "KZT", [ep.line(d, "MILK", 60), ep.line(d, "BREAD", 40)])
        ep.book_sale(inv)
        weekly.append(inv)
    ep.payment(c["cafe"], at(2026, 9, 18, 15, 10), "KZT", [(i, i["total_minor"]) for i in weekly])

    # Distractor: split payment (two payments settle one invoice)
    d = dn()
    h["split"] = ep.invoice(c["bistro"], at(2026, 9, 10, 13, 0), "KZT", [ep.line(d, "OIL", 4), ep.line(d, "CHEESE", 2)])
    ep.book_sale(h["split"])
    ep.payment(c["bistro"], at(2026, 9, 15, 11, 0), "KZT", [(h["split"], 4_000_000)])
    ep.payment(c["bistro"], at(2026, 9, 22, 11, 30), "KZT", [(h["split"], h["split"]["total_minor"] - 4_000_000)])

    # Distractor: USD invoice and payment rendered in +00:00, realised FX difference to 7000
    d = dn()
    usd = ep.invoice(c["foreign"], at(2026, 9, 16, 14, 0), "USD", [ep.line(d, "COFFEE", 60, price=20_50)], offset=0, due_days=30)
    ep.book_sale(usd)
    ep.payment(c["foreign"], at(2026, 9, 25, 9, 0), "USD", [(usd, usd["total_minor"])], offset=0)

    # Distractor: correction = full reversal by credit note + corrected re-issue on the SAME delivery note (D-14a)
    d = dn()
    orig = ep.invoice(c["canteen"], at(2026, 9, 8, 10, 0), "KZT", [ep.line(d, "DETERG", 10)])
    ep.book_sale(orig)
    cn = ep.invoice(c["canteen"], at(2026, 9, 9, 11, 0), "KZT",
                    [ep.line(d, "DETERG", -10, ref=orig["invoice_id"])],
                    description=f"Reversal of {orig['invoice_id']}")
    ep.book_credit_note(cn)
    fixed = ep.invoice(c["canteen"], at(2026, 9, 9, 11, 5), "KZT", [ep.line(d, "DETERG", 10, price=3600_00)])
    ep.book_sale(fixed)
    ep.payment(c["canteen"], at(2026, 9, 24, 16, 0), "KZT", [(fixed, fixed["total_minor"])])

    # Distractor: customer underpaid; payment fully allocated, invoice legitimately still open
    d = dn()
    under = ep.invoice(c["bar"], at(2026, 9, 17, 18, 0), "KZT", [ep.line(d, "BREAD", 30), ep.line(d, "MILK", 50)])
    ep.book_sale(under)
    ep.payment(c["bar"], at(2026, 9, 28, 10, 0), "KZT", [(under, 2_000_000)])

    # Distractor: payment without reference, correctly parked in 1900
    ep.payment(c["bar"], at(2026, 9, 29, 12, 0), "KZT", [], refs=None, to_suspense=1_500_000)

    # Distractor: last local day of the period, rendered in +00:00 (same date) -> booked in period
    d = dn()
    last = ep.invoice(c["cafe"], at(2026, 9, 30, 23, 40), "KZT", [ep.line(d, "MILK", 80)], offset=0)
    ep.book_sale(last)

    # Distractor: first local hours of October, rendered in +00:00 shows 30 Sep -> correctly NOT in period
    d = dn()
    nxt = ep.invoice(c["kiosk"], at(2026, 10, 1, 2, 15), "KZT", [ep.line(d, "BREAD", 60), ep.line(d, "MILK", 30)], offset=0)
    ep.book_sale(nxt)
    return h


def build_clean():
    ep = Episode("clean")
    build_base(ep)
    ep.write()


def build_duplicate():
    ep = Episode("duplicate")
    h = build_base(ep)
    orig = h["split"]
    # Injected: the clerk re-entered the bistro invoice two days later. Same delivery note and goods,
    # but lines reordered and re-worded, new ids, no reversing credit note.
    lines = [ep.line(it["delivery_note_id"], key, it["quantity"], alt=True)
             for it in reversed(orig["line_items"])
             for key, cat in CATALOG.items() if cat[0] == it["sku"]]
    copy = ep.invoice(orig["entity_id"], at(2026, 9, 12, 15, 20), "KZT", lines)
    rows = ep.book_sale(copy)
    amount = ep.meta[copy["invoice_id"]]["kzt"]
    ep.issues.append({
        "issue_id": "ISS-01", "type": "duplicate_invoice",
        "affected_ids": sorted([orig["invoice_id"], copy["invoice_id"]]),
        "expected_amount_minor": amount, "currency": "KZT",
        "evidence_sets": [
            [orig["doc_id"], copy["doc_id"], rows["revenue"]],
            [orig["doc_id"], copy["doc_id"], rows["ar"]],
        ],
    })
    ep.changes.append({
        "issue_id": "ISS-01", "kind": "duplicate_invoice",
        "decision": "clerk re-entered an already invoiced delivery without reversing the original",
        "before": None,
        "after": {"invoice_id": copy["invoice_id"], "doc_id": copy["doc_id"],
                  "duplicates": orig["invoice_id"], "delivery_note_id": orig["line_items"][0]["delivery_note_id"]},
        "touched_ids": [copy["doc_id"], copy["invoice_id"], rows["ar"], rows["revenue"]],
    })
    ep.write()


def build_allocation():
    ep = Episode("allocation")
    h = build_base(ep)
    c = h["c"]
    d = ep.new_id("DN", 5)
    inv = ep.invoice(c["canteen"], at(2026, 9, 11, 12, 0), "KZT", [ep.line(d, "COFFEE", 4), ep.line(d, "CHEESE", 2)])
    ep.book_sale(inv)
    short = 2_400_000
    correct_ar = inv["total_minor"]
    # Injected: payment names the invoice and covers it in full, but the clerk credited AR only partly;
    # the rest went to unallocated receipts (1900).
    pay, rows = ep.payment(c["canteen"], at(2026, 9, 21, 16, 45), "KZT", [(inv, inv["total_minor"])],
                           ar_override={inv["invoice_id"]: correct_ar - short})
    ep.issues.append({
        "issue_id": "ISS-01", "type": "payment_allocation",
        "affected_ids": sorted([pay["payment_id"], inv["invoice_id"]]),
        "expected_amount_minor": short, "currency": "KZT",
        "evidence_sets": [
            [pay["doc_id"], inv["doc_id"], rows["suspense"]],
            [pay["doc_id"], inv["doc_id"], rows["ar"][0]],
        ],
    })
    ep.changes.append({
        "issue_id": "ISS-01", "kind": "payment_allocation", "variant": "partial",
        "decision": "clerk applied the payment to the invoice only partly",
        "before": {"ar_credit_minor": correct_ar, "suspense_minor": 0},
        "after": {"ar_credit_minor": correct_ar - short, "suspense_minor": short},
        "touched_ids": [pay["payment_id"], inv["invoice_id"], rows["ar"][0], rows["suspense"]],
    })
    ep.write()


if __name__ == "__main__":
    build_clean()
    build_duplicate()
    build_allocation()
    print("fixtures written to", OUT)
