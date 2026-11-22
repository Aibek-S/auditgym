"""Clean hidden business history of NorthAngels for one month (DECISIONS sections 1, 7). Owner: Aibek.

The history uses internal keys (`inv:0001`, `pay:0001`, `cust:01`, `dn:0001`). Public ids are
drawn later by `render.py`, after error injection (D-41), so injected records cannot be recognised
by their ids.

Booking decisions (`book_ts`, `book_rate_day`, `ar_override`) are normally `None`, meaning the
clerk follows `policy.json`. Error injectors in #3 change exactly these decisions (D-35).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from auditgym import rng
from auditgym.money import FxTable, parse_offset, round_half_up

UTC = timezone.utc

# sku, description, alternative wording (used by duplicate copies, D-14a), KZT unit price (minor)
CATALOG = [
    ("MILK-32-1L", "Milk 3.2% 1L", "Milk 3,2 % 1 l", 450_00),
    ("BREAD-WHT", "White bread loaf", "Bread white, loaf", 250_00),
    ("COFFEE-1KG", "Coffee beans 1 kg", "Coffee, beans, 1kg", 9_800_00),
    ("OIL-OLV-5L", "Olive oil 5 L", "Oil olive 5l", 12_500_00),
    ("CHEESE-PRM", "Parmesan 1 kg", "Parmesan cheese 1kg", 14_200_00),
    ("DETERG-5L", "Dish detergent 5 L", "Detergent dish 5l", 3_900_00),
    ("RICE-BAS-5", "Basmati rice 5 kg", "Rice basmati, 5kg", 6_400_00),
    ("FLOUR-PRM", "Flour premium 10 kg", "Premium flour 10kg", 4_100_00),
    ("SUGAR-1KG", "Sugar 1 kg", "Sugar, 1kg", 520_00),
    ("BEEF-TND", "Beef tenderloin 1 kg", "Tenderloin beef 1kg", 7_900_00),
    ("CHICK-FIL", "Chicken fillet 1 kg", "Fillet chicken, 1kg", 2_650_00),
    ("SALMON-FR", "Salmon fillet 1 kg", "Fresh salmon fillet 1kg", 11_300_00),
    ("TOMATO-KG", "Tomatoes 1 kg", "Tomato, 1kg", 980_00),
    ("POTATO-10", "Potatoes 10 kg", "Potato 10kg", 2_300_00),
    ("JUICE-ORG", "Orange juice 1 L", "Juice orange 1l", 890_00),
    ("WATER-05", "Mineral water 0.5 L x12", "Water mineral 0,5l x12", 1_450_00),
    ("NAPKIN-500", "Paper napkins 500 pcs", "Napkins paper 500pcs", 1_200_00),
    ("GLOVES-100", "Nitrile gloves 100 pcs", "Gloves nitrile 100pcs", 3_100_00),
]
SKU_INDEX = {c[0]: c for c in CATALOG}

SEGMENTS = ["restaurant", "cafe", "hotel", "canteen", "trader", "bar"]


@dataclass
class Line:
    sku: str
    description: str
    quantity: int
    unit_price_minor: int
    delivery_note: str
    ref_invoice: str | None = None

    @property
    def amount_minor(self) -> int:
        return self.quantity * self.unit_price_minor


@dataclass
class Invoice:
    key: str
    customer: str
    issued: datetime
    offset: timezone
    due_days: int
    currency: str
    lines: list[Line]
    kind: str = "sale"  # "sale" | "credit_note"
    opening: bool = False  # issued in the previous month, carried as opening balance (D-17)
    book_ts: datetime | None = None  # clerk decision: when revenue was booked
    book_rate_day: date | None = None  # clerk decision: which day's rate was used

    @property
    def total_minor(self) -> int:
        return sum(line.amount_minor for line in self.lines)

    @property
    def reverses(self) -> str | None:
        refs = {line.ref_invoice for line in self.lines if line.ref_invoice}
        return refs.pop() if refs else None


@dataclass
class Payment:
    key: str
    customer: str
    ts: datetime
    offset: timezone
    currency: str
    amount_minor: int
    refs: list[str] | None  # invoice keys named in the remittance; None = no reference
    ar_override: dict[str, int] | None = None  # clerk decision: KZT credited to AR per invoice
    book_rate_day: date | None = None


@dataclass
class SupplierEvent:
    ts: datetime
    kind: str  # "purchase" | "supplier_payment"
    amount_minor: int


@dataclass
class Customer:
    key: str
    segment: str
    currency: str
    recurring: bool


@dataclass
class History:
    seed: int
    config: dict
    local: timezone
    period_start: datetime
    period_end: datetime
    window_end: datetime
    fx: FxTable
    customers: dict[str, Customer] = field(default_factory=dict)
    invoices: dict[str, Invoice] = field(default_factory=dict)
    payments: dict[str, Payment] = field(default_factory=dict)
    supplier_events: list[SupplierEvent] = field(default_factory=list)
    distractors: list[dict] = field(default_factory=list)  # private diagnostics, never rendered as such

    def local_day(self, ts: datetime) -> date:
        return ts.astimezone(self.local).date()

    def in_period(self, ts: datetime) -> bool:
        return self.period_start <= ts < self.period_end

    def note(self, kind: str, **keys) -> None:
        self.distractors.append({"kind": kind, **keys})


class _Builder:
    def __init__(self, seed: int, config: dict):
        self.r = rng.stream(seed, "history")
        self.config = config
        local = parse_offset(config["timezone"])
        year = self.r.choice(config["period_years"])
        month = self.r.randint(1, 12)
        start = datetime(year, month, 1, tzinfo=local)
        end = datetime(year + (month == 12), month % 12 + 1, 1, tzinfo=local)
        window_end = end + timedelta(days=config["cutoff_window_days"])
        fx = _build_fx(rng.stream(seed, "fx"), start.date() - timedelta(days=10), window_end.date())
        self.h = History(seed, config, local, start, end, window_end, fx)
        self.counter = {"inv": 0, "pay": 0, "dn": 0}
        self.days = [start.date() + timedelta(days=i) for i in range((window_end.date() - start.date()).days)]
        self.period_days = [d for d in self.days if d < end.date()]
        self.approx_rate = {cur: fx.rate_on(cur, start.date())[0] for cur in ("USD", "EUR")}

    # --- primitives ---------------------------------------------------------
    def key(self, kind: str) -> str:
        self.counter[kind] += 1
        return f"{kind}:{self.counter[kind]:04d}"

    def at(self, day: date, hour: int, minute: int) -> datetime:
        return datetime(day.year, day.month, day.day, hour, minute, tzinfo=self.h.local)

    def offset(self) -> timezone:
        return UTC if self.r.random() < 0.3 else self.h.local

    def price(self, sku: str, currency: str) -> int:
        kzt = SKU_INDEX[sku][3]
        if currency == "KZT":
            return kzt
        return max(1, round_half_up(Decimal(kzt) / self.approx_rate[currency]))

    def lines(self, currency: str, dn: str, skus=None, k=None) -> list[Line]:
        if skus is None:
            skus = [c[0] for c in self.r.sample(CATALOG, k or self.r.randint(1, 4))]
        # ~20% of legitimate lines use the alternative wording, so wording alone never marks a duplicate
        return [Line(s, SKU_INDEX[s][2 if self.r.random() < 0.2 else 1], self.r.randint(2, 60),
                     self.price(s, currency), dn) for s in skus]

    def invoice(self, customer: Customer, issued: datetime, lines=None, offset=None, kind="sale",
                opening=False, currency=None) -> Invoice:
        currency = currency or customer.currency
        dn = self.key("dn")
        inv = Invoice(
            key=self.key("inv"), customer=customer.key, issued=issued, offset=offset or self.offset(),
            due_days=30 if currency != "KZT" else self.r.choice([7, 14, 14, 30]), currency=currency,
            lines=lines if lines is not None else self.lines(currency, dn), kind=kind, opening=opening,
        )
        if kind == "sale" and not opening and self.r.random() < 0.4:
            booked = issued + timedelta(minutes=self.r.randint(10, 18 * 60))
            # legitimate lag never crosses the period boundary or the end of the records
            if self.h.in_period(booked) == self.h.in_period(issued) and booked < self.h.window_end:
                inv.book_ts = booked
        self.h.invoices[inv.key] = inv
        return inv

    def payment(self, customer: str, ts: datetime, currency: str, amount: int, refs) -> Payment:
        pay = Payment(self.key("pay"), customer, ts, self.offset(), currency, amount, refs)
        self.h.payments[pay.key] = pay
        return pay

    def business_time(self, day: date) -> datetime:
        return self.at(day, self.r.randint(8, 19), self.r.randint(0, 59))

    def customers(self, currency: str | None = None, exclude=()) -> list[Customer]:
        return [c for c in self.h.customers.values()
                if (currency is None or c.currency == currency) and c.key not in exclude]

    # --- build ----------------------------------------------------------------
    def build(self) -> History:
        self.make_customers()
        self.make_opening_invoices()
        self.make_regular_invoices()
        self.make_special_invoices()
        self.make_payments()
        self.make_supplier_events()
        self.top_up_ledger()
        return self.h

    def top_up_ledger(self) -> None:
        """Add aggregate purchases until the ledger reaches the configured minimum size."""
        from auditgym.ledger import build_ledger

        min_rows = self.config["size"]["ledger_rows"][0]
        rows = sum(len(e.rows) for e in build_ledger(self.h))
        while rows < min_rows:
            day = self.r.choice(self.period_days)
            amount = self.r.randint(50, 400) * 10_000_00
            self.h.supplier_events.append(SupplierEvent(self.at(day, self.r.randint(9, 17), self.r.randint(0, 59)),
                                                        "purchase", amount))
            rows += 2
        self.h.supplier_events.sort(key=lambda e: (e.ts, e.kind))

    def make_customers(self) -> None:
        lo, hi = self.config["size"]["customers"]
        n = self.r.randint(lo, hi)
        n_foreign = max(2, round(n * self.config["foreign_share"]))
        for i in range(n):
            key = f"cust:{i + 1:02d}"
            if i < n_foreign:
                currency = "USD" if i % 2 == 0 else "EUR"
                self.h.customers[key] = Customer(key, "foreign", currency, False)
            else:
                # the first two local customers always order weekly (recurring-order distractor)
                recurring = i < n_foreign + 2 or self.r.random() < 0.35
                self.h.customers[key] = Customer(key, self.r.choice(SEGMENTS), "KZT", recurring)

    def make_opening_invoices(self) -> None:
        start = self.h.period_start.date()
        for customer in self.r.sample(self.customers("KZT"), self.r.randint(2, 4)):
            day = start - timedelta(days=self.r.randint(2, 18))
            inv = self.invoice(customer, self.business_time(day), opening=True, offset=self.h.local)
            self.h.note("opening_balance", invoice=inv.key)

    def make_regular_invoices(self) -> None:
        lo, hi = self.config["size"]["invoices"]
        target = self.r.randint(lo, hi)
        # recurring weekly orders: same lines and total, new delivery note each week
        for customer in self.customers("KZT"):
            if not customer.recurring:
                continue
            weekday = self.r.randint(0, 6)
            skus = [c[0] for c in self.r.sample(CATALOG, self.r.randint(1, 3))]
            qty = [self.r.randint(5, 50) for _ in skus]
            created = []
            for day in self.days:
                if day.weekday() == weekday:
                    dn = self.key("dn")
                    lines = [Line(s, SKU_INDEX[s][1], q, self.price(s, "KZT"), dn) for s, q in zip(skus, qty)]
                    created.append(self.invoice(customer, self.at(day, self.r.randint(7, 10), self.r.randint(0, 59)), lines))
            if len(created) >= 2:
                self.h.note("recurring_order", invoices=[i.key for i in created])
        foreign = self.customers("USD") + self.customers("EUR")
        local_customers = self.customers("KZT")
        while len(self.h.invoices) < target:
            pool = foreign if self.r.random() < self.config["foreign_share"] else local_customers
            customer = self.r.choice(pool)
            self.invoice(customer, self.business_time(self.r.choice(self.days)))

    def make_special_invoices(self) -> None:
        """Legitimate look-alikes that a naive auditor would flag (DECISIONS section 7, D-14a)."""
        h, r = self.h, self.r
        kzt = self.customers("KZT")
        mid = self.period_days[3:-6]

        # correction: full reversal by credit note + corrected re-issue on the same delivery note
        c = r.choice(kzt)
        day = r.choice(mid)
        orig = self.invoice(c, self.business_time(day))
        dn = orig.lines[0].delivery_note
        reversal = [Line(l.sku, f"Reversal of {{{orig.key}}}", -l.quantity, l.unit_price_minor, dn, orig.key)
                    for l in orig.lines]
        cn = self.invoice(c, orig.issued + timedelta(hours=r.randint(20, 30)), reversal, kind="credit_note")
        fixed_lines = [Line(l.sku, l.description, l.quantity, max(1, l.unit_price_minor * r.randint(85, 95) // 100), dn)
                       for l in orig.lines]
        fixed = self.invoice(c, cn.issued + timedelta(minutes=r.randint(3, 40)), fixed_lines)
        h.note("correction_reissue", original=orig.key, credit_note=cn.key, reissue=fixed.key)

        # partial return: credit note for part of one line
        c = r.choice(kzt)
        sold = self.invoice(c, self.business_time(r.choice(mid)), self.lines("KZT", "", k=r.randint(2, 4)))
        dn = self.key("dn")
        for line in sold.lines:
            line.delivery_note = dn
        line = r.choice(sold.lines)
        back = max(1, line.quantity // r.randint(3, 6))
        ret = [Line(line.sku, f"Return of {{{sold.key}}}", -back, line.unit_price_minor, dn, sold.key)]
        cn = self.invoice(c, sold.issued + timedelta(days=r.randint(1, 3), hours=r.randint(0, 5)), ret, kind="credit_note")
        h.note("partial_return", invoice=sold.key, credit_note=cn.key)

        # split invoicing: one delivery note billed on two invoices with different goods
        c = r.choice(kzt)
        when = self.business_time(r.choice(mid))
        dn = self.key("dn")
        skus = [x[0] for x in r.sample(CATALOG, 4)]
        a = self.invoice(c, when, self.lines("KZT", dn, skus[:2]))
        b = self.invoice(c, when + timedelta(minutes=r.randint(1, 30)), self.lines("KZT", dn, skus[2:]))
        h.note("split_invoicing", invoices=[a.key, b.key])

        # identical totals for two different customers (different delivery notes)
        c1, c2 = r.sample(kzt, 2)
        template = self.lines("KZT", "")
        pair = []
        for cust in (c1, c2):
            dn = self.key("dn")
            lines = [Line(l.sku, l.description, l.quantity, l.unit_price_minor, dn) for l in template]
            pair.append(self.invoice(cust, self.business_time(r.choice(self.period_days)), lines))
        h.note("same_total_other_customer", invoices=[i.key for i in pair])

        # the same basket ordered twice by one customer, 0-6 days apart, each on its own delivery note:
        # exactly two invoices with one customer and one total, the outward shape of a duplicate, so
        # "two equal invoices of one customer" is no shortcut; only the shared delivery note is (D-14b)
        one_off = [c for c in kzt if not c.recurring] or kzt
        repeat_days = self.period_days[:-7] or self.period_days
        for cust in r.sample(one_off, min(len(one_off), r.randint(2, 3))):
            template = self.lines("KZT", "")
            first_day = r.choice(repeat_days)
            pair = []
            for day in (first_day, first_day + timedelta(days=r.randint(0, 6))):
                dn = self.key("dn")
                lines = [Line(l.sku, l.description if r.random() < 0.8 else SKU_INDEX[l.sku][2], l.quantity,
                              l.unit_price_minor, dn) for l in template]
                pair.append(self.invoice(cust, self.business_time(day), lines))
            h.note("same_basket_repeat", invoices=[i.key for i in pair])

        # period boundary: last local evening of the period, and first local hours of the next period
        # rendered in +00:00 (its UTC date is still the last day of the period)
        last_day = self.period_days[-1]
        late = self.invoice(r.choice(kzt), self.at(last_day, 23, r.randint(5, 55)), offset=UTC)
        first = self.invoice(r.choice(kzt), self.at(self.h.period_end.date(), r.randint(0, 4), r.randint(0, 59)), offset=UTC)
        h.note("boundary_last_evening", invoice=late.key)
        h.note("boundary_next_period_utc", invoice=first.key)

        # foreign invoice on a weekend: converted with the last business-day rate
        foreign = self.customers("USD") + self.customers("EUR")
        weekend = [d for d in self.period_days if d.weekday() >= 5]
        if weekend:
            inv = self.invoice(r.choice(foreign), self.business_time(r.choice(weekend)))
            h.note("weekend_rate", invoice=inv.key)

        # large wholesale foreign orders (same size class as the I1 scenario invoice), so size
        # alone never points at an error
        premium = [k for k, v in SKU_INDEX.items() if v[3] >= 7_000_00]
        for _ in range(r.randint(3, 5)):
            cust = r.choice(foreign)
            dn = self.key("dn")
            skus = r.sample(premium, r.randint(2, 4))
            lines = [Line(sk, SKU_INDEX[sk][1], r.randint(150, 500), self.price(sk, cust.currency), dn) for sk in skus]
            big = self.invoice(cust, self.business_time(r.choice(self.period_days)), lines)
            h.note("large_foreign_order", invoice=big.key)

        # foreign invoice in early local hours, rendered in +00:00: UTC date != local date
        candidates = [d for d in self.period_days if d.weekday() in (1, 2, 3, 4)]
        day = r.choice(candidates)
        inv = self.invoice(r.choice(foreign), self.at(day, r.randint(1, 4), r.randint(0, 59)), offset=UTC)
        h.note("utc_date_differs", invoice=inv.key)

    def make_payments(self) -> None:
        h, r = self.h, self.r
        limit = self.config["hard_limits"]["documents"] - self.config["errors"]["reserve_documents"]
        budget = limit - len(h.invoices)
        credit = {}
        for inv in h.invoices.values():
            if inv.kind == "credit_note":
                credit[inv.reverses] = credit.get(inv.reverses, 0) + (-inv.total_minor)
                credit[inv.reverses + "@"] = max(credit.get(inv.reverses + "@", inv.issued), inv.issued)
        payable = [i for i in h.invoices.values()
                   if i.kind == "sale" and i.total_minor - credit.get(i.key, 0) > 0]
        payable.sort(key=lambda i: i.issued)

        def earliest(inv: Invoice) -> datetime:
            return max(inv.book_ts or inv.issued, credit.get(inv.key + "@", inv.issued)) + timedelta(hours=2)

        def when(inv: Invoice, after: datetime | None = None) -> datetime | None:
            start = after or earliest(inv)
            ts = start + timedelta(days=r.uniform(0.2, inv.due_days * 1.2))
            ts = self.at(h.local_day(ts), r.randint(9, 18), r.randint(0, 59))
            if ts <= start:
                ts = start + timedelta(minutes=r.randint(30, 300))
            return ts if ts < h.window_end else None

        def net(inv: Invoice) -> int:
            return inv.total_minor - credit.get(inv.key, 0)

        done: set[str] = set()

        # payments without any invoice reference, correctly parked in 1900
        for _ in range(r.randint(1, 2)):
            c = r.choice(self.customers("KZT"))
            day = r.choice(self.period_days)
            pay = self.payment(c.key, self.business_time(day), "KZT", r.randint(5, 300) * 1000_00 + r.randint(1, 99) * 100, None)
            budget -= 1
            h.note("no_reference_payment", payment=pay.key)


        # combined payments: one transfer settles 2-4 invoices of one customer
        by_customer: dict[tuple, list[Invoice]] = {}
        for inv in payable:
            if not inv.opening and inv.key not in credit:  # keep credit-noted invoices out of combined payments
                by_customer.setdefault((inv.customer, inv.currency), []).append(inv)
        groups = [v for (cust, cur), v in sorted(by_customer.items()) if cur == "KZT" and len(v) >= 2]
        for n, group_src in enumerate(r.sample(groups, min(len(groups), r.randint(1, 3)))):
            group = group_src[: r.randint(2, min(4, len(group_src)))]
            ts = when(group[-1])
            if ts is None and n == 0:  # guarantee at least one combined payment
                ts = earliest(group[-1]) + timedelta(minutes=r.randint(30, 240))
                ts = ts if ts < h.window_end else None
            if ts is None or budget <= 0:
                continue
            pay = self.payment(group[0].customer, ts, "KZT", sum(net(i) for i in group), [i.key for i in group])
            budget -= 1
            done.update(i.key for i in group)
            h.note("combined_payment", payment=pay.key, invoices=[i.key for i in group])

        # guarantee one foreign invoice settled at a different rate -> realised FX difference (7000)
        for inv in (i for i in payable if i.currency != "KZT" and i.key not in done):
            rate_issue = h.fx.rate_on(inv.currency, h.local_day(inv.issued))[0]
            day = h.local_day(earliest(inv)) + timedelta(days=1)
            ts = None
            while day < h.window_end.date():
                if h.fx.rate_on(inv.currency, day)[0] != rate_issue:
                    ts = self.at(day, r.randint(9, 18), r.randint(0, 59))
                    break
                day += timedelta(days=1)
            if ts is not None and ts < h.window_end:
                self.payment(inv.customer, ts, inv.currency, net(inv), [inv.key])
                budget -= 1
                done.add(inv.key)
                break

        forced = {"split_payment": 0, "underpaid": 0, "overpaid": 0}
        for inv in payable:
            if inv.key in done or budget <= 0:
                continue
            roll = r.random()
            if inv.currency != "KZT":
                pattern = "split_payment" if roll < 0.2 else "full"
            elif roll < 0.12:
                pattern = "split_payment"
            elif roll < 0.20:
                pattern = "underpaid"
            elif roll < 0.26:
                pattern = "overpaid"
            else:
                pattern = "full"
            # make sure each distractor appears at least once
            for name in forced:
                if forced[name] == 0 and len(done) > len(payable) // 2 and (name != "overpaid" or inv.currency == "KZT") \
                        and (inv.currency == "KZT" or name == "split_payment"):
                    pattern = name
                    break
            ts = when(inv)
            if ts is None:
                continue
            amount = net(inv)
            if pattern == "split_payment" and budget >= 2:
                first = round_half_up(Decimal(amount) * Decimal(r.randint(30, 70)) / 100)
                ts2 = when(inv, after=ts)
                if ts2 is None:
                    pattern = "full"
                else:
                    p1 = self.payment(inv.customer, ts, inv.currency, first, [inv.key])
                    p2 = self.payment(inv.customer, ts2, inv.currency, amount - first, [inv.key])
                    budget -= 2
                    h.note("split_payment", invoice=inv.key, payments=[p1.key, p2.key])
            if pattern == "underpaid":
                part = max(1000_00, amount * r.randint(30, 85) // 100 // 1000_00 * 1000_00)
                if part >= amount:
                    pattern = "full"
                else:
                    pay = self.payment(inv.customer, ts, "KZT", part, [inv.key])
                    budget -= 1
                    h.note("underpaid_open_invoice", invoice=inv.key, payment=pay.key)
            if pattern == "overpaid":
                pay = self.payment(inv.customer, ts, "KZT", amount + r.randint(1, 40) * 500_00, [inv.key])
                budget -= 1
                h.note("overpayment_to_1900", invoice=inv.key, payment=pay.key)
            if pattern == "full":
                self.payment(inv.customer, ts, inv.currency, amount, [inv.key])
                budget -= 1
            forced[pattern] = forced.get(pattern, 0) + 1
            done.add(inv.key)

        for p in h.payments.values():
            if p.currency != "KZT" and p.refs:
                inv = h.invoices[p.refs[0]]
                if h.fx.rate_on(p.currency, h.local_day(p.ts))[0] != h.fx.rate_on(inv.currency, h.local_day(inv.issued))[0]:
                    h.note("realised_fx_difference", payment=p.key)
                    break

    def make_supplier_events(self) -> None:
        """Aggregate purchases and supplier payments (D-02): realism and volume only."""
        h, r = self.h, self.r
        rows = 2 * len(h.invoices) + sum(2 + (len(p.refs or []) or 1) for p in h.payments.values())
        min_rows = self.config["size"]["ledger_rows"][0]
        pairs = max(4, math.ceil((min_rows - rows) / 4) + 2 + r.randint(0, 3))  # +2: some supplier payments fall outside the window
        revenue_kzt = sum(h.fx.to_base(i.total_minor, i.currency, h.local_day(i.issued))
                          for i in h.invoices.values() if i.kind == "sale")
        each = max(500_000_00, revenue_kzt * r.randint(55, 75) // 100 // pairs // 100_00 * 100_00)
        for _ in range(pairs):
            day = r.choice(self.period_days)
            ts = self.at(day, r.randint(9, 17), r.randint(0, 59))
            amount = each + r.randint(-20, 20) * 10_000_00
            h.supplier_events.append(SupplierEvent(ts, "purchase", amount))
            pay_ts = ts + timedelta(days=r.randint(3, 20))
            if pay_ts < h.window_end:
                h.supplier_events.append(SupplierEvent(self.at(h.local_day(pay_ts), 12, r.randint(0, 59)),
                                                       "supplier_payment", amount))
        h.supplier_events.sort(key=lambda e: (e.ts, e.kind))


def _build_fx(r, first: date, last: date) -> FxTable:
    """Business-day USD/EUR -> KZT rates, seeded random walk, 2 decimals (D-18)."""
    usd = Decimal(r.randint(44000, 52000)) / 100
    eur = (usd * Decimal(r.randint(105, 118)) / 100).quantize(Decimal("0.01"))
    rows = []
    day = first
    while day <= last:
        if day.weekday() < 5:
            rows.append((day, "USD", "KZT", usd))
            rows.append((day, "EUR", "KZT", eur))
            usd = (usd * (1 + Decimal(r.randint(-60, 60)) / 10000)).quantize(Decimal("0.01"))
            eur = (eur * (1 + Decimal(r.randint(-60, 60)) / 10000)).quantize(Decimal("0.01"))
        day += timedelta(days=1)
    return FxTable(rows)


def build_history(seed: int, config: dict) -> History:
    return _Builder(seed, config).build()
