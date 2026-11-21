"""The four baseline policies required by the brief (D-80).

`random`, `flag_all` and `reconcile` see only observations. `oracle` is evaluator-side: the runner
gives it the private truth directly; it never runs as a separate agent process.
"""

from __future__ import annotations

import random as _random
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from auditgym.matcher import TYPES

TABLES = ("ledger", "invoices", "payments", "fx")


def _submit(episode_id, findings):
    return {"action": "submit", "findings": {"episode_id": episode_id, "findings": findings}}


class RandomExplorer:
    """Random valid actions for a random 5-60 steps, then 0-3 random findings over seen ids."""

    name = "random"

    def __init__(self, seed: int = 0):
        self.r = _random.Random(f"random:{seed}")
        self.budget = self.r.randint(5, 60)
        self.episode_id = None
        self.ids: list[str] = []
        self.docs: list[str] = []

    def act(self, obs):
        res = obs.get("result") or {}
        if self.episode_id is None:
            self.episode_id = res["manifest"]["episode_id"]
        for row in res.get("rows", []) if isinstance(res, dict) else []:
            for k in ("invoice_id", "payment_id", "row_id", "doc_id"):
                if row.get(k):
                    (self.docs if k == "doc_id" else self.ids).append(row[k])
        if obs["steps_used"] >= self.budget or obs["steps_remaining"] <= 1:
            findings = []
            for _ in range(self.r.randint(0, 3)):
                if not self.ids:
                    break
                findings.append({"type": self.r.choice(TYPES), "affected_ids": self.r.sample(self.ids, 1),
                                 "claimed_amount_minor": self.r.randint(1, 5_000_000) * 100, "currency": "KZT",
                                 "evidence_ids": self.r.sample(self.ids + self.docs, min(3, len(self.ids))),
                                 "explanation": "random"})
            return _submit(self.episode_id, findings)
        kind = self.r.random()
        if kind < 0.5 or not self.docs:
            return {"action": "list_records", "table": self.r.choice(TABLES), "limit": 50}
        if kind < 0.8:
            return {"action": "get_document", "doc_id": self.r.choice(self.docs)}
        return {"action": "calculator", "expression": f"{self.r.randint(1, 999)} * {self.r.randint(1, 999)}"}


class FlagAll:
    """Attack: list the invoices once, then submit 30 findings over every type and seen id."""

    name = "flag_all"

    def __init__(self, seed: int = 0):
        self.episode_id = None
        self.rows: list[dict] = []
        self.cursor = None
        self.started = False

    def act(self, obs):
        res = obs.get("result") or {}
        if self.episode_id is None:
            self.episode_id = res["manifest"]["episode_id"]
        if isinstance(res, dict) and "rows" in res:
            self.rows += res["rows"]
            self.cursor = res["next_cursor"]
        if not self.started or (self.cursor and len(self.rows) < 100):
            self.started = True
            return {"action": "list_records", "table": "invoices", "cursor": self.cursor, "limit": 50}
        findings = []
        for n in range(30):
            row = self.rows[n % len(self.rows)]
            findings.append({"type": TYPES[n % 4], "affected_ids": [row["invoice_id"]],
                             "claimed_amount_minor": abs(row["total_minor"]), "currency": "KZT",
                             "evidence_ids": [row["doc_id"]], "explanation": "flag everything"})
        return _submit(self.episode_id, findings)


class Oracle:
    """Evaluator-only: canonical findings straight from truth, 0 inspection steps -> maximum reward."""

    name = "oracle"

    def __init__(self, truth: dict):
        self.truth = truth

    def act(self, obs):
        findings = [{"type": i["type"], "affected_ids": i["affected_ids"], "claimed_amount_minor": i["expected_amount_minor"],
                     "currency": i["currency"], "evidence_ids": i["evidence_sets"][0], "explanation": "oracle"}
                    for i in self.truth["issues"]]
        return _submit(self.truth["episode_id"], findings)


class Reconcile:
    """Rule-based auditor: reads everything it can within the budget and applies the published policy.

    1. Page through ledger, payments, fx and invoices (about 15-25 steps).
    2. Open invoice documents of suspicious pairs (same customer + total) and foreign invoices.
    3. Check: duplicate delivery notes, short AR credits vs payment refs, KZT vs policy rate,
       revenue booked in a different period than issued.
    """

    name = "reconcile"

    def __init__(self, seed: int = 0, reserve: int = 2):
        self.reserve = reserve
        self.episode_id = None
        self.manifest = None
        self.tables = {t: [] for t in TABLES}
        self.pending = list(TABLES)
        self.cursor = None
        self.docs: dict[str, dict] = {}
        self.to_open: list[str] | None = None

    def act(self, obs):
        res = obs.get("result") or {}
        if self.manifest is None:
            self.manifest = res["manifest"]
            self.episode_id = self.manifest["episode_id"]
        if isinstance(res, dict) and "rows" in res:
            self.tables[res["table"]] += res["rows"]
            self.cursor = res["next_cursor"]
            if self.cursor is None:
                self.pending.pop(0)
        if isinstance(res, dict) and res.get("kind") == "invoice":
            self.docs[res["document"]["doc_id"]] = res["document"]
        left = obs["steps_remaining"]
        if self.pending and left > self.reserve:
            return {"action": "list_records", "table": self.pending[0], "cursor": self.cursor, "limit": 50}
        if self.to_open is None:
            self.to_open = self._documents_to_open()
        while self.to_open and left > self.reserve:
            doc = self.to_open.pop(0)
            if doc not in self.docs:
                return {"action": "get_document", "doc_id": doc}
        return _submit(self.episode_id, self._findings())

    # --- analysis ----------------------------------------------------------
    def _documents_to_open(self):
        groups = defaultdict(list)
        for inv in self.tables["invoices"]:
            if inv["total_minor"] > 0:
                groups[(inv["entity_id"], inv["total_minor"], inv["currency"])].append(inv["doc_id"])
        out = [d for docs in groups.values() if len(docs) > 1 for d in docs]
        return out

    def _local_day(self, text):
        tz = self.manifest["timezone"]
        sign = -1 if tz.startswith("-") else 1
        h, m = tz.lstrip("+-").split(":")
        offset = timezone(sign * timedelta(hours=int(h), minutes=int(m)))
        return datetime.fromisoformat(text).astimezone(offset).date()

    def _rate(self, currency, day):
        best = None
        for r in self.tables["fx"]:
            if r["source_currency"] == currency and date.fromisoformat(r["date"]) <= day:
                if best is None or r["date"] > best["date"]:
                    best = r
        return best

    def _findings(self):
        f = []
        ledger = self.tables["ledger"]
        inv_by_id = {i["invoice_id"]: i for i in self.tables["invoices"]}
        start = datetime.fromisoformat(self.manifest["period_start"])
        end = datetime.fromisoformat(self.manifest["period_end"])
        sale_rows = defaultdict(dict)
        for r in ledger:
            if r["invoice_id"] and not r["payment_id"] and r["account"] in ("1200", "4000"):
                sale_rows[r["invoice_id"]][r["account"]] = r

        # duplicates: same customer, same goods and delivery note, no reversing credit note
        reversed_ids = {x["ref_invoice_id"] for d in self.docs.values() for x in d["line_items"] if x["ref_invoice_id"]}
        seen = {}
        for doc in sorted(self.docs.values(), key=lambda d: datetime.fromisoformat(d["issued_at"])):  # offsets differ
            if doc["total_minor"] <= 0 or doc["invoice_id"] in reversed_ids:
                continue
            key = (doc["entity_id"], tuple(sorted((x["delivery_note_id"], x["sku"], x["quantity"]) for x in doc["line_items"])))
            if key in seen:
                first = seen[key]
                row = sale_rows.get(doc["invoice_id"], {}).get("4000")
                if row:
                    f.append({"type": "duplicate_invoice", "affected_ids": [first["invoice_id"], doc["invoice_id"]],
                              "claimed_amount_minor": row["credit_minor"], "currency": "KZT",
                              "evidence_ids": [first["doc_id"], doc["doc_id"], row["row_id"]],
                              "explanation": "same customer, delivery note and goods; no reversal"})
            else:
                seen[key] = doc

        # payment allocation: single-reference KZT payment that covers the invoice but AR credit is short
        for pay in self.tables["payments"]:
            refs = pay["invoice_refs"] or []
            if pay["currency"] != "KZT" or len(refs) != 1 or refs[0] not in inv_by_id:
                continue
            inv = inv_by_id[refs[0]]
            if pay["amount_minor"] != inv["total_minor"]:
                continue
            ar = sum(r["credit_minor"] for r in ledger if r["payment_id"] == pay["payment_id"] and r["account"] == "1200")
            susp = [r for r in ledger if r["payment_id"] == pay["payment_id"] and r["account"] == "1900"]
            others = [p for p in self.tables["payments"] if p is not pay and refs[0] in (p["invoice_refs"] or [])]
            if ar < inv["total_minor"] and susp and not others:
                f.append({"type": "payment_allocation", "affected_ids": [pay["payment_id"], inv["invoice_id"]],
                          "claimed_amount_minor": susp[0]["credit_minor"], "currency": "KZT",
                          "evidence_ids": [pay["doc_id"], inv["doc_id"], susp[0]["row_id"]],
                          "explanation": "payment names and covers the invoice, rest parked in 1900"})

        # FX on invoices and payments
        def conv(amount, rate):
            return int((Decimal(amount) * Decimal(rate["rate"])).quantize(Decimal(1), rounding=ROUND_HALF_UP))

        for inv in self.tables["invoices"]:
            if inv["currency"] == "KZT" or inv["invoice_id"] not in sale_rows:
                continue
            row = sale_rows[inv["invoice_id"]].get("1200")
            rate = self._rate(inv["currency"], self._local_day(inv["issued_at"]))
            if row and rate:
                diff = abs(row["debit_minor"] - conv(abs(inv["total_minor"]), rate))
                if diff > 100:
                    f.append({"type": "fx_conversion", "affected_ids": [inv["invoice_id"]], "claimed_amount_minor": diff,
                              "currency": "KZT", "evidence_ids": [inv["doc_id"], row["row_id"],
                                                                  f'{rate["date"]}:{rate["source_currency"]}:KZT'],
                              "explanation": "booked KZT differs from document x policy rate"})
        for pay in self.tables["payments"]:
            if pay["currency"] == "KZT":
                continue
            bank = [r for r in ledger if r["payment_id"] == pay["payment_id"] and r["account"] in ("1020", "1030")]
            rate = self._rate(pay["currency"], self._local_day(pay["timestamp"]))
            if bank and rate:
                diff = abs(bank[0]["debit_minor"] - conv(pay["amount_minor"], rate))
                if diff > 100:
                    f.append({"type": "fx_conversion", "affected_ids": [pay["payment_id"]], "claimed_amount_minor": diff,
                              "currency": "KZT", "evidence_ids": [pay["doc_id"], bank[0]["row_id"],
                                                                  f'{rate["date"]}:{rate["source_currency"]}:KZT'],
                              "explanation": "bank KZT differs from payment x policy rate"})

        # cutoff: revenue booked in a different period than the invoice was issued
        for inv_id, rows in sale_rows.items():
            row = rows.get("4000")
            inv = inv_by_id.get(inv_id)
            if not row or not inv:
                continue
            issued_in = start <= datetime.fromisoformat(inv["issued_at"]) < end
            booked_in = start <= datetime.fromisoformat(row["timestamp"]) < end
            if issued_in != booked_in:
                f.append({"type": "period_cutoff", "affected_ids": [inv_id], "claimed_amount_minor": row["credit_minor"],
                          "currency": "KZT", "evidence_ids": [inv["doc_id"], row["row_id"]],
                          "explanation": "revenue booked outside the period of issue"})
        return f[:30]


def registry() -> dict:
    """Policies that run as agents (oracle is evaluator-side and excluded)."""
    return {
        "random": lambda session: RandomExplorer(seed=session.seed),
        "flag_all": lambda session: FlagAll(),
        "reconcile": lambda session: Reconcile(),
    }
