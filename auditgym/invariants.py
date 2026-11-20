"""Accounting invariants INV-1..7 checked on the PUBLIC files only (DECISIONS section 4). Owner: Aibek.

`check(public)` recomputes what the ledger must contain from the documents, `fx.csv` and the
published `policy.json` rules, and returns every difference as a Violation. A clean episode
returns []. In #3, an episode with injected errors must return exactly the declared issues.

Working from public files only means the jury (or anyone) can verify the data independently.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from auditgym.money import FxTable, parse_offset, parse_ts, prorate

BANK_ACCOUNTS = {"KZT": "1010", "USD": "1020", "EUR": "1030"}
ACCOUNTS = {"1010", "1020", "1030", "1200", "1900", "2000", "2100", "3900", "4000", "4100", "5000", "7000"}


@dataclass(frozen=True)
class Violation:
    code: str  # INV-1 .. INV-7
    ids: tuple  # public ids involved
    detail: str


def check(pub: dict) -> list[Violation]:
    out: list[Violation] = []
    m = pub["manifest"]
    local = parse_offset(m["timezone"])
    start, end = parse_ts(m["period_start"]), parse_ts(m["period_end"])
    fx = FxTable.from_public(pub["fx"])
    invoices = {i["invoice_id"]: i for i in pub["invoices"]}
    payments = {p["payment_id"]: p for p in pub["payments"]}
    ledger = pub["ledger"]

    def day(ts_text: str):
        return parse_ts(ts_text).astimezone(local).date()

    # INV-1: every event balances; ledger is in base currency
    events = defaultdict(int)
    for r in ledger:
        if r["account"] not in ACCOUNTS or r["currency"] != m["base_currency"]:
            out.append(Violation("INV-1", (r["row_id"],), "unknown account or non-base currency"))
        if (r["debit_minor"] == 0) == (r["credit_minor"] == 0) or min(r["debit_minor"], r["credit_minor"]) < 0:
            out.append(Violation("INV-1", (r["row_id"],), "row must have exactly one positive side"))
        key = (r["timestamp"], r["payment_id"]) if r["payment_id"] else (r["timestamp"], r["invoice_id"])
        events[key] += r["debit_minor"] - r["credit_minor"]
    for key, diff in events.items():
        if diff:
            out.append(Violation("INV-1", tuple(x for x in key[1:] if x), f"event at {key[0]} off by {diff}"))

    # INV-2: invoice totals
    for inv in pub["invoices"]:
        lines_ok = all(x["amount_minor"] == x["quantity"] * x["unit_price_minor"] for x in inv["line_items"])
        if not lines_ok or inv["total_minor"] != sum(x["amount_minor"] for x in inv["line_items"]):
            out.append(Violation("INV-2", (inv["invoice_id"],), "total != sum of lines"))

    # INV-6: references resolve
    for r in ledger:
        for col, known in (("invoice_id", invoices), ("payment_id", payments)):
            if r[col] is not None and r[col] not in known:
                out.append(Violation("INV-6", (r["row_id"],), f"unknown {col} {r[col]}"))
    for p in pub["payments"]:
        for ref in p["invoice_refs"] or []:
            if ref not in invoices:
                out.append(Violation("INV-6", (p["payment_id"],), f"unknown invoice ref {ref}"))
    for inv in pub["invoices"]:
        for x in inv["line_items"]:
            if x["ref_invoice_id"] and x["ref_invoice_id"] not in invoices:
                out.append(Violation("INV-6", (inv["invoice_id"],), "unknown ref_invoice_id"))

    # rows per invoice / payment
    inv_rows = defaultdict(list)
    pay_rows = defaultdict(list)
    for r in ledger:
        if r["payment_id"]:
            pay_rows[r["payment_id"]].append(r)
        elif r["invoice_id"]:
            inv_rows[r["invoice_id"]].append(r)

    # INV-5 / INV-7: one booking event per invoice, right period, right KZT amount
    carrying: dict[str, int] = {}
    for inv_id, inv in invoices.items():
        issued = parse_ts(inv["issued_at"])
        expected_kzt = fx.to_base(abs(inv["total_minor"]), inv["currency"], day(inv["issued_at"]))
        rows = inv_rows.get(inv_id, [])
        is_credit = inv["total_minor"] < 0
        if issued < start:
            want = {"1200": ("debit", expected_kzt), "3900": ("credit", expected_kzt)}
        elif is_credit:
            want = {"4100": ("debit", expected_kzt), "1200": ("credit", expected_kzt)}
        else:
            want = {"1200": ("debit", expected_kzt), "4000": ("credit", expected_kzt)}
        got = {r["account"]: r for r in rows}
        if len(rows) != 2 or set(got) != set(want):
            out.append(Violation("INV-5", (inv_id,), f"expected one booking with {sorted(want)}, got {len(rows)} rows"))
            continue
        booked_kzt = got["1200"]["debit_minor"] or got["1200"]["credit_minor"]
        carrying[inv_id] = booked_kzt if not is_credit else 0
        if booked_kzt != expected_kzt:
            out.append(Violation("INV-7", (inv_id,), f"booked {booked_kzt} KZT, policy gives {expected_kzt}"))
        if issued >= start:
            booked_at = parse_ts(got["1200"]["timestamp"])
            if (start <= issued < end) != (start <= booked_at < end):
                out.append(Violation("INV-5", (inv_id,), "booked in a different period than issued_at"))
        elif parse_ts(got["1200"]["timestamp"]) != start:
            out.append(Violation("INV-5", (inv_id,), "opening balance not dated period_start"))

    # INV-3 / INV-4: replay the published allocation rule and compare every receipt
    credit_notes = sorted(
        (i for i in pub["invoices"] if i["total_minor"] < 0), key=lambda i: parse_ts(i["issued_at"]))
    open_doc = {k: i["total_minor"] for k, i in invoices.items() if i["total_minor"] > 0}
    relieved_doc = defaultdict(int)
    relieved_kzt = defaultdict(int)
    cn_i = 0
    ordered = sorted(pub["payments"], key=lambda p: (parse_ts(p["timestamp"]), p["amount_minor"], p["currency"]))
    for p in ordered:
        p_ts = parse_ts(p["timestamp"])
        while cn_i < len(credit_notes) and parse_ts(credit_notes[cn_i]["issued_at"]) <= p_ts:
            cn = credit_notes[cn_i]
            ref = next(x["ref_invoice_id"] for x in cn["line_items"] if x["ref_invoice_id"])
            open_doc[ref] = open_doc.get(ref, 0) + cn["total_minor"]
            cn_i += 1
        pid = p["payment_id"]
        rows = pay_rows.get(pid, [])
        bank_expected = fx.to_base(p["amount_minor"], p["currency"], day(p["timestamp"]))
        bank_rows = [r for r in rows if r["account"] == BANK_ACCOUNTS[p["currency"]]]
        if len(bank_rows) != 1 or bank_rows[0]["debit_minor"] != bank_expected:
            out.append(Violation("INV-4", (pid,), f"bank row != {bank_expected} KZT"))
        remaining = p["amount_minor"]
        expected_ar: dict[str, int] = {}
        for ref in p["invoice_refs"] or []:
            if ref not in open_doc:
                continue
            part = min(open_doc[ref], remaining)
            if part <= 0:
                continue
            open_doc[ref] -= part
            remaining -= part
            relieved_doc[ref] += part
            inv = invoices[ref]
            if p["currency"] == "KZT":
                ar = part
            elif open_doc[ref] == 0:
                ar = carrying.get(ref, 0) - relieved_kzt[ref]
            else:
                ar = prorate(carrying.get(ref, 0), relieved_doc[ref], inv["total_minor"]) - relieved_kzt[ref]
            relieved_kzt[ref] += ar
            expected_ar[ref] = expected_ar.get(ref, 0) + ar
        got_ar = defaultdict(int)
        for r in rows:
            if r["account"] == "1200":
                got_ar[r["invoice_id"]] += r["credit_minor"] - r["debit_minor"]
        for ref in sorted(set(expected_ar) | set(got_ar)):
            if expected_ar.get(ref, 0) != got_ar.get(ref, 0):
                out.append(Violation("INV-3", (pid, ref),
                                     f"AR credit {got_ar.get(ref, 0)} KZT, policy gives {expected_ar.get(ref, 0)}"))
        susp_expected = fx.to_base(remaining, p["currency"], day(p["timestamp"])) if remaining else 0
        if p["currency"] == "KZT":
            susp_expected = bank_expected - sum(expected_ar.values())
        susp_got = sum(r["credit_minor"] - r["debit_minor"] for r in rows if r["account"] == "1900")
        if susp_got != susp_expected and not any(v.code == "INV-3" and v.ids[0] == pid for v in out):
            out.append(Violation("INV-3", (pid,), f"1900 credit {susp_got} KZT, policy gives {susp_expected}"))

    # invoices must never be over-relieved
    for ref, left in open_doc.items():
        if left < 0:
            out.append(Violation("INV-3", (ref,), "invoice relieved beyond its total"))

    # INV-8: a delivered (delivery note, sku) is billed at most once, unless fully reversed
    sale_lines = defaultdict(list)
    full_reversals = defaultdict(int)
    for inv in pub["invoices"]:
        for x in inv["line_items"]:
            key = (x["delivery_note_id"], x["sku"])
            if inv["total_minor"] > 0:
                sale_lines[key].append(inv["invoice_id"])
            elif x["ref_invoice_id"] in invoices:
                original = [y for y in invoices[x["ref_invoice_id"]]["line_items"] if y["sku"] == x["sku"]]
                if original and x["quantity"] == -original[0]["quantity"]:
                    full_reversals[key] += 1
    billed = defaultdict(set)
    for key, ids in sale_lines.items():
        if len(ids) - full_reversals[key] > 1:
            billed[key[0]].update(ids)
    for dn, ids in sorted(billed.items()):
        out.append(Violation("INV-8", tuple(sorted(ids)), f"delivery note {dn} billed twice without reversal"))
    return out


# ---------------------------------------------------------------------------
# Truth verification (D-37): exact correspondence + evidence sufficiency
# ---------------------------------------------------------------------------

def expected_violations(issue: dict) -> set[tuple[str, tuple]]:
    """Which INV violations an issue must cause, keyed by (code, frozen ids)."""
    t, ids = issue["type"], tuple(sorted(issue["affected_ids"]))
    if t == "duplicate_invoice":
        return {("INV-8", ids)}
    if t == "payment_allocation":
        return {("INV-3", ids)}
    if t == "fx_conversion":
        return {("INV-7" if ids[0].startswith("INV-") else "INV-4", ids)}
    if t == "period_cutoff":
        return {("INV-5", ids)}
    raise ValueError(t)


def evidence_amount(issue_type: str, evidence: list[str], pub: dict) -> int | None:
    """Recompute the misstatement from ONE evidence set plus policy/manifest/fx. None = not provable."""
    m = pub["manifest"]
    local = parse_offset(m["timezone"])
    start, end = parse_ts(m["period_start"]), parse_ts(m["period_end"])
    fx = FxTable.from_public(pub["fx"])
    docs = {d["doc_id"]: d for d in pub["invoices"] + pub["payments"]}
    rows = {r["row_id"]: r for r in pub["ledger"]}
    fx_keys = {f'{r["date"]}:{r["source_currency"]}:{r["target_currency"]}': r for r in pub["fx"]}
    inv_docs = [docs[x] for x in evidence if x in docs and "invoice_id" in docs[x]]
    pay_docs = [docs[x] for x in evidence if x in docs and "payment_id" in docs[x]]
    ev_rows = [rows[x] for x in evidence if x in rows]
    ev_fx = [fx_keys[x] for x in evidence if x in fx_keys]
    if len(ev_rows) != 1 or any(x not in docs and x not in rows and x not in fx_keys for x in evidence):
        return None
    row = ev_rows[0]
    amount_of_row = row["debit_minor"] + row["credit_minor"]

    def day(text):
        return parse_ts(text).astimezone(local).date()

    if issue_type == "duplicate_invoice":
        if len(inv_docs) != 2 or pay_docs:
            return None
        a, b = inv_docs
        goods = lambda i: sorted((x["delivery_note_id"], x["sku"], x["quantity"], x["unit_price_minor"])  # noqa: E731
                                 for x in i["line_items"])
        if a["entity_id"] != b["entity_id"] or goods(a) != goods(b) or a["total_minor"] <= 0:
            return None
        if row["invoice_id"] not in (a["invoice_id"], b["invoice_id"]) or row["account"] not in ("1200", "4000"):
            return None
        return amount_of_row
    if issue_type == "payment_allocation":
        if len(inv_docs) != 1 or len(pay_docs) != 1:
            return None
        inv, pay = inv_docs[0], pay_docs[0]
        if inv["invoice_id"] not in (pay["invoice_refs"] or []) or pay["currency"] != "KZT":
            return None
        if pay["amount_minor"] < inv["total_minor"] or row["payment_id"] != pay["payment_id"]:
            return None
        if row["account"] == "1900":
            return row["credit_minor"]
        if row["account"] == "1200" and row["invoice_id"] == inv["invoice_id"]:
            return inv["total_minor"] - row["credit_minor"]
        return None
    if issue_type == "fx_conversion":
        docs_here = inv_docs + pay_docs
        if len(docs_here) != 1 or len(ev_fx) != 1:
            return None
        doc = docs_here[0]
        if "payment_id" in doc:
            if row["payment_id"] != doc["payment_id"] or row["account"] != BANK_ACCOUNTS[doc["currency"]]:
                return None
        elif row["invoice_id"] != doc["invoice_id"] or row["payment_id"] or row["account"] not in ("1200", "4000"):
            return None
        when = doc.get("issued_at") or doc.get("timestamp")
        _rate, key = fx.rate_on(doc["currency"], day(when))
        if key != f'{ev_fx[0]["date"]}:{ev_fx[0]["source_currency"]}:KZT':
            return None  # cited rate must be the policy rate
        amount = abs(doc.get("total_minor", doc.get("amount_minor")))
        return abs(amount_of_row - fx.to_base(amount, doc["currency"], day(when)))
    if issue_type == "period_cutoff":
        if len(inv_docs) != 1 or pay_docs:
            return None
        inv = inv_docs[0]
        issued_in = start <= parse_ts(inv["issued_at"]) < end
        booked_in = start <= parse_ts(row["timestamp"]) < end
        if row["invoice_id"] != inv["invoice_id"] or issued_in == booked_in:
            return None
        return amount_of_row
    return None


def verify_episode(pub: dict, truth: dict) -> list[str]:
    """Empty list = the episode is valid: violations == truth, every evidence set proves its amount."""
    problems = []
    found = {(v.code, tuple(sorted(v.ids))) for v in check(pub)}
    expected = set()
    for issue in truth["issues"]:
        expected |= expected_violations(issue)
    if found != expected:
        problems.append(f"violations mismatch: unexpected={sorted(found - expected)} missing={sorted(expected - found)}")
    tol = pub["policy"]["amount_tolerance_minor"]
    for issue in truth["issues"]:
        for evidence in issue["evidence_sets"]:
            got = evidence_amount(issue["type"], evidence, pub)
            if got is None or abs(got - issue["expected_amount_minor"]) > tol:
                problems.append(f"{issue['issue_id']} evidence {evidence} gives {got}, expected {issue['expected_amount_minor']}")
    return problems
