"""Error injection into the clean hidden history (DECISIONS sections 5-7). Owner: Aibek.

An error is a changed clerk decision (D-35): an extra copy of an invoice, a wrong AR credit
(`ar_override`), a wrong rate date (`book_rate_day`) or a wrong booking time (`book_ts`).
The ledger is then rebuilt from the history, so every derived row stays consistent.

Safety rules that keep the data valid (each one is also verified after rendering):
- distractor records are never touched, so every legitimate look-alike stays intact;
- a record (and the invoices/payments linked to it) carries at most one error, except inside
  the interacting scenarios I1 and I2, which are designed together;
- every amount is computed before injection and must be >= errors.min_amount_minor;
- the expected invariant violations are derived from the truth and must equal exactly what
  `invariants.check` finds on the public files, and every evidence set must reproduce the
  amount (`invariants.verify_episode`). Otherwise `generate` retries with another draw.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from auditgym.history import SKU_INDEX, History, Invoice, Line, Payment

UTC = timezone.utc
TYPES = ("duplicate_invoice", "payment_allocation", "fx_conversion", "period_cutoff")
SCENARIOS = ("I1", "I2")
# distractor kinds whose records may still receive an error (they are classes, not single records)
UNPROTECTED_NOTES = {"recurring_order", "opening_balance", "large_foreign_order"}


@dataclass
class Planned:
    type: str
    affected: list  # [("inv" | "pay", internal key)]
    amount: int  # KZT minor units (D-31)
    evidence: list  # list of sets; refs: ("doc_inv", key) ("doc_pay", key) ("row", kind, ref, role) ("fx", key)
    change: dict = field(default_factory=dict)
    scenario: str | None = None


class Injector:
    def __init__(self, h: History, r, config: dict):
        self.h, self.r, self.cfg = h, r, config
        self.min = config["errors"]["min_amount_minor"]
        self.n = 0
        self.used: set[str] = set()
        self.pays_of: dict[str, list[Payment]] = {}
        for p in h.payments.values():
            for ref in p.refs or []:
                self.pays_of.setdefault(ref, []).append(p)
        self.credited = {i.reverses for i in h.invoices.values() if i.kind == "credit_note"}
        self.protected: set[str] = set()
        for note in h.distractors:
            if note["kind"] in UNPROTECTED_NOTES:
                continue
            for value in note.values():
                for k in value if isinstance(value, list) else [value]:
                    if isinstance(k, str) and ":" in k:
                        self.protected.add(k)
        for _ in range(2):  # close over payment <-> invoice links
            for p in h.payments.values():
                refs = p.refs or []
                if p.key in self.protected or any(x in self.protected for x in refs):
                    self.protected.add(p.key)
                    self.protected.update(refs)

    # --- helpers -------------------------------------------------------------
    def key(self, kind: str) -> str:
        self.n += 1
        return f"{kind}:e{self.n:02d}"

    def free(self, *keys) -> bool:
        return all(k not in self.used and k not in self.protected for k in keys)

    def mark(self, *keys) -> None:
        for k in keys:
            self.used.add(k)
            if k.startswith("inv:"):
                self.used.update(p.key for p in self.pays_of.get(k, []))
            elif k.startswith("pay:"):
                self.used.update(self.h.payments[k].refs or [])

    def kzt(self, inv: Invoice, day=None) -> int:
        return self.h.fx.to_base(abs(inv.total_minor), inv.currency, day or self.h.local_day(inv.issued))

    def at(self, day, hour, minute) -> datetime:
        return datetime(day.year, day.month, day.day, hour, minute, tzinfo=self.h.local)

    def sales(self) -> list[Invoice]:
        out = [i for i in self.h.invoices.values()
               if i.kind == "sale" and not i.opening and i.key not in self.credited and self.free(i.key)]
        self.r.shuffle(out)
        return out

    def run(self, name: str) -> list[Planned] | None:
        result = getattr(self, name.lower())()
        if result is None:
            return None
        return result if isinstance(result, list) else [result]

    # --- duplicate_invoice ----------------------------------------------------
    def duplicate_invoice(self, a: Invoice | None = None) -> Planned | None:
        h, r = self.h, self.r
        candidates = [a] if a else [i for i in self.sales() if h.in_period(i.issued)]
        for a in candidates:
            when = a.issued + timedelta(days=r.randint(0, 3), hours=r.randint(1, 9), minutes=r.randint(0, 59))
            if not h.in_period(when):
                when = a.issued + timedelta(hours=r.randint(1, 4), minutes=r.randint(0, 59))
            if not h.in_period(when):
                continue
            lines = []
            for line in a.lines:
                _sku, desc, alt, _price = SKU_INDEX[line.sku]
                other = alt if line.description == desc else desc
                lines.append(Line(line.sku, other if r.random() < 0.6 else line.description, line.quantity,
                                  line.unit_price_minor, line.delivery_note))
            r.shuffle(lines)
            copy = Invoice(self.key("inv"), a.customer, when, UTC if r.random() < 0.3 else h.local,
                           a.due_days, a.currency, lines)
            amount = self.kzt(copy)
            if amount < self.min:
                continue
            h.invoices[copy.key] = copy
            self.mark(a.key, copy.key)
            return Planned(
                "duplicate_invoice", [("inv", a.key), ("inv", copy.key)], amount,
                [[("doc_inv", a.key), ("doc_inv", copy.key), ("row", "sale", copy.key, "revenue")],
                 [("doc_inv", a.key), ("doc_inv", copy.key), ("row", "sale", copy.key, "ar")]],
                {"variant": "re-entered", "decision": "already invoiced delivery re-entered without reversing the original",
                 "before": None, "after": {"copy_issued_at": when.isoformat(), "kzt": amount}},
            )
        return None

    # --- payment_allocation ---------------------------------------------------
    def _allocation_pairs(self, require_free=True):
        pairs = []
        for p in self.h.payments.values():
            if p.currency != "KZT" or not p.refs or len(p.refs) != 1 or p.ar_override:
                continue
            x = self.h.invoices[p.refs[0]]
            if (x.kind != "sale" or x.opening or x.key in self.credited or len(self.pays_of.get(x.key, [])) != 1
                    or p.amount_minor != x.total_minor or x.total_minor < self.min):
                continue
            if require_free and not self.free(p.key, x.key):
                continue
            pairs.append((p, x))
        self.r.shuffle(pairs)
        return pairs

    def payment_allocation(self, pair=None) -> Planned | None:
        r = self.r
        pairs = [pair] if pair else self._allocation_pairs()
        for p, x in pairs:
            total = x.total_minor
            if total >= 2 * self.min and r.random() < 0.65:
                variant = "partial"
                short = r.randint(self.min, total - self.min) // 100 * 100
                short = max(short, self.min)
            else:
                variant, short = "missing", total
            p.ar_override = {x.key: total - short}
            self.mark(p.key, x.key)
            evidence = [[("doc_pay", p.key), ("doc_inv", x.key), ("row", "receipt", p.key, "suspense")]]
            if variant == "partial":
                evidence.append([("doc_pay", p.key), ("doc_inv", x.key), ("row", "receipt", p.key, f"ar:{x.key}")])
            return Planned(
                "payment_allocation", [("pay", p.key), ("inv", x.key)], short, evidence,
                {"variant": variant, "decision": "payment applied to the named invoice only partly; rest parked in 1900",
                 "before": {"ar_credit_minor": total, "suspense_minor": 0},
                 "after": {"ar_credit_minor": total - short, "suspense_minor": short}},
            )
        return None

    # --- fx_conversion --------------------------------------------------------
    def _wrong_day(self, currency: str, correct_day):
        h, r = self.h, self.r
        first = h.fx.rows[0][0]
        rate, key = h.fx.rate_on(currency, correct_day)
        if r.random() < 0.5:
            variant = "previous_business_day"
            wrong = datetime.fromisoformat(key.split(":")[0]).date() - timedelta(days=1)
        else:
            variant = "stale_rate"
            wrong = correct_day - timedelta(days=r.randint(2, 10))
        if wrong < first or h.fx.rate_on(currency, wrong)[0] == rate:
            return None
        return variant, wrong, key

    def fx_conversion(self) -> Planned | None:
        h, r = self.h, self.r
        options = []
        for inv in self.sales():
            if inv.currency != "KZT" and inv.book_rate_day is None:
                options.append(("inv", inv))
        for p in h.payments.values():
            if p.currency != "KZT" and p.refs and self.free(p.key) and p.book_rate_day is None:
                options.append(("pay", p))
        r.shuffle(options)
        for side, doc in options:
            ts = doc.issued if side == "inv" else doc.ts
            correct_day = h.local_day(ts)
            picked = self._wrong_day(doc.currency, correct_day)
            if picked is None:
                continue
            variant, wrong, key = picked
            amount = abs(doc.total_minor) if side == "inv" else doc.amount_minor
            diff = abs(h.fx.to_base(amount, doc.currency, wrong) - h.fx.to_base(amount, doc.currency, correct_day))
            if diff < self.min:
                continue
            doc.book_rate_day = wrong
            self.mark(doc.key)
            if side == "inv":
                evidence = [[("doc_inv", doc.key), ("row", "sale", doc.key, role), ("fx", key)] for role in ("revenue", "ar")]
            else:
                evidence = [[("doc_pay", doc.key), ("row", "receipt", doc.key, "bank"), ("fx", key)]]
            return Planned(
                "fx_conversion", [(side, doc.key)], diff, evidence,
                {"variant": f"{side}:{variant}", "decision": "converted with the rate of a wrong date",
                 "before": {"rate_day": correct_day.isoformat()}, "after": {"rate_day": wrong.isoformat()}},
            )
        return None

    # --- period_cutoff --------------------------------------------------------
    def period_cutoff(self) -> Planned | None:
        h, r = self.h, self.r
        end = h.period_end
        last_day = end.date() - timedelta(days=1)
        window_days = (h.window_end.date() - end.date()).days
        for inv in self.sales():
            if inv.issued >= end:  # issued after the period, booked inside it (overstated)
                variant = "booked_early"
                booked = self.at(last_day - timedelta(days=r.randint(0, 2)), r.randint(9, 20), r.randint(0, 59))
                ok = h.period_start <= booked < end and booked < inv.issued
            elif inv.issued >= end - timedelta(days=3):  # issued at the end, booked after it (understated)
                variant = "booked_late"
                booked = self.at(end.date() + timedelta(days=r.randint(0, max(0, window_days - 2))),
                                 r.randint(9, 20), r.randint(0, 59))
                ok = end <= booked < h.window_end and booked > inv.issued
            else:
                continue
            amount = self.kzt(inv)
            if not ok or amount < self.min:
                continue
            before = (inv.book_ts or inv.issued).isoformat()
            inv.book_ts = booked
            self.mark(inv.key)
            return Planned(
                "period_cutoff", [("inv", inv.key)], amount,
                [[("doc_inv", inv.key), ("row", "sale", inv.key, role)] for role in ("revenue", "ar")],
                {"variant": variant, "decision": "revenue booked in a different reporting period",
                 "before": {"booked_at": before}, "after": {"booked_at": booked.isoformat()}},
            )
        return None

    # --- interacting scenarios ------------------------------------------------
    def i1(self) -> list[Planned] | None:
        """FX invoice issued in the first local hours of the next period, rendered in +00:00.
        The clerk took the UTC date as the business date: booked in the period (cutoff) AND converted
        with the last day's rate (fx). The customer also paid part of it (legitimate)."""
        h, r = self.h, self.r
        end_day = h.period_end.date()
        last_day = end_day - timedelta(days=1)
        if end_day.weekday() >= 5:  # same rate for both dates -> FX error would be zero
            return None
        foreign = [c for c in h.customers.values() if c.currency != "KZT"]
        r.shuffle(foreign)
        for customer in foreign:
            cur = customer.currency
            if h.fx.rate_on(cur, last_day)[0] == h.fx.rate_on(cur, end_day)[0]:
                continue
            issued = self.at(end_day, r.randint(0, 4), r.randint(0, 59))
            approx = h.fx.rate_on(cur, end_day)[0]
            # a large wholesale order (expensive goods, big quantities): one day's rate move is
            # only ~0.1-0.6 %, so a small invoice would give an FX error below the minimum
            premium = [k for k, v in SKU_INDEX.items() if v[3] >= 7_000_00]
            inv = None
            for _ in range(8):
                dn = self.key("dn")
                skus = r.sample(premium, r.randint(2, 4))
                lines = [Line(s, SKU_INDEX[s][1], r.randint(150, 500), max(1, int(SKU_INDEX[s][3] / approx)), dn)
                         for s in skus]
                candidate = Invoice(self.key("inv"), customer.key, issued, UTC, 30, cur, lines)
                booked_kzt = h.fx.to_base(candidate.total_minor, cur, last_day)
                diff = abs(booked_kzt - h.fx.to_base(candidate.total_minor, cur, end_day))
                if diff >= self.min:
                    inv = candidate
                    break
            if inv is None:
                continue
            correct_key = h.fx.rate_on(cur, end_day)[1]
            utc = issued.astimezone(UTC)
            inv.book_ts = datetime(utc.year, utc.month, utc.day, utc.hour, utc.minute, tzinfo=h.local)
            inv.book_rate_day = last_day
            h.invoices[inv.key] = inv
            pay_ts = self.at(end_day + timedelta(days=r.randint(1, 3)), r.randint(9, 17), r.randint(0, 59))
            if pay_ts < h.window_end:
                part = inv.total_minor * r.randint(30, 70) // 100
                pay = Payment(self.key("pay"), customer.key, pay_ts, UTC if r.random() < 0.5 else h.local,
                              cur, part, [inv.key])
                h.payments[pay.key] = pay
                h.note("partial_payment_foreign", payment=pay.key, invoice=inv.key)
                self.mark(pay.key)
            self.mark(inv.key)
            common = {"decision": "UTC date of the document used as the local business date"}
            return [
                Planned("period_cutoff", [("inv", inv.key)], booked_kzt,
                        [[("doc_inv", inv.key), ("row", "sale", inv.key, role)] for role in ("revenue", "ar")],
                        {**common, "variant": "utc_date_booked_early", "before": {"booked_at": issued.isoformat()},
                         "after": {"booked_at": inv.book_ts.isoformat()}}, "I1"),
                Planned("fx_conversion", [("inv", inv.key)], diff,
                        [[("doc_inv", inv.key), ("row", "sale", inv.key, role), ("fx", correct_key)]
                         for role in ("revenue", "ar")],
                        {**common, "variant": "inv:utc_date_rate", "before": {"rate_day": end_day.isoformat()},
                         "after": {"rate_day": last_day.isoformat()}}, "I1"),
            ]
        return None

    def i2(self) -> list[Planned] | None:
        """Invoice A duplicated, and A's full payment applied only partly (confused by the copy)."""
        for p, x in self._allocation_pairs():
            if not self.h.in_period(x.issued):
                continue
            dup = self.duplicate_invoice(a=x)
            if dup is None:
                continue
            alloc = self.payment_allocation(pair=(p, x))
            dup.scenario = alloc.scenario = "I2"
            return [dup, alloc]
        return None


def choose_plan(config: dict, r) -> list[str]:
    ec = config["errors"]
    if ec.get("plan") is not None:
        return list(ec["plan"])
    roll = r.random()
    if roll < ec["clean_share"]:
        return []
    lo, hi = ec["count"]
    if roll < ec["clean_share"] + ec["interacting_share"]:
        plan = [r.choice(ec["interacting"])]
        extra = r.randint(0, max(0, hi - 2))
    else:
        plan, extra = [], r.randint(max(1, lo), hi)
    return plan + [r.choice(ec["types"]) for _ in range(extra)]


def inject(h: History, config: dict, r) -> tuple[list[Planned], list[str]]:
    injector = Injector(h, r, config)
    plan = choose_plan(config, r)
    forced = config["errors"].get("plan") is not None
    planned: list[Planned] = []
    for item in plan:
        if forced:
            order = [item]  # a forced plan never silently changes type
        elif item == "I1":
            order = ["I1", "I2"]  # I1 is impossible when the month ends on Fri/Sat/Sun (same rate both dates)
        elif item == "I2":
            order = ["I2"]
        else:
            others = [t for t in config["errors"]["types"] if t != item]
            r.shuffle(others)
            order = [item] + others
        for name in order:
            result = injector.run(name)
            if result:
                planned.extend(result)
                break
    if len(planned) > config["hard_limits"]["errors"]:
        raise ValueError("too many errors for the configured hard limit")
    return planned, plan
