"""History + ledger -> episode folder with public/ and private/ files (D-41..D-43, section 11). Owner: Aibek.

Public ids are drawn here, after any error injection, from the `ids` stream (salted by `id_salt`
for the paired checks). Row order is chronological with random tie-breaks, or fully shuffled
when `order_mode = "shuffled"`.
"""

from __future__ import annotations

import csv
import json
import string
from datetime import timedelta, timezone
from pathlib import Path

from auditgym import DECISIONS_VERSION, GENERATOR_VERSION, SCHEMA_VERSION, rng
from auditgym.episode import FX_COLUMNS, LEDGER_COLUMNS, POLICY
from auditgym.history import History
from auditgym.ledger import Event
from auditgym.money import iso

ALPHABET = string.ascii_uppercase + string.digits
ID_SHAPE = {"inv": ("INV", 6), "doc": ("DOC", 6), "pay": ("PAY", 6), "row": ("L", 6),
            "cust": ("C", 4), "dn": ("DN", 5)}


class IdMap:
    def __init__(self, seed: int, salt: str | None):
        self.r = rng.stream(seed, "ids", salt)
        self.used: set[str] = set()
        self.map: dict[tuple[str, str], str] = {}

    def get(self, kind: str, key: str) -> str:
        if (kind, key) not in self.map:
            prefix, n = ID_SHAPE[kind]
            while True:
                value = f"{prefix}-" + "".join(self.r.choice(ALPHABET) for _ in range(n))
                if value not in self.used:
                    break
            self.used.add(value)
            self.map[(kind, key)] = value
        return self.map[(kind, key)]


def render(h: History, events: list[Event], out: Path, *, planned=None, plan=None, attempt=0) -> dict:
    """Write the episode folder. Returns {"ids": IdMap, "rows": {(event_index, row_index): row_id}}."""
    cfg = h.config
    salt = cfg.get("id_salt")
    ids = IdMap(h.seed, salt)
    order_r = rng.stream(h.seed, "order", salt)
    episode_r = rng.stream(h.seed, "episode", salt)
    episode_id = "".join(episode_r.choice("0123456789abcdef") for _ in range(16))
    shuffled = cfg.get("order_mode") == "shuffled"

    # Draw ids in a seed-shuffled order of entities, so ids carry no creation-order signal.
    entities = ([("cust", k) for k in h.customers] + [("inv", k) for k in h.invoices]
                + [("doc", "i" + k) for k in h.invoices] + [("pay", k) for k in h.payments]
                + [("doc", "p" + k) for k in h.payments]
                + [("dn", dn) for dn in sorted({l.delivery_note for i in h.invoices.values() for l in i.lines})])
    order_r.shuffle(entities)
    for kind, key in entities:
        ids.get(kind, key)
    row_slots = [(e, k) for e, ev in enumerate(events) for k in range(len(ev.rows))]
    order_r.shuffle(row_slots)
    row_ids = {slot: ids.get("row", f"{slot[0]}:{slot[1]}") for slot in row_slots}

    def sort_key(ts, tie):
        return (order_r.random(),) if shuffled else (ts.astimezone(timezone.utc), tie)

    # invoices
    invoice_docs = []
    for inv in h.invoices.values():
        items = []
        for n, line in enumerate(inv.lines, 1):
            desc = line.description
            if line.ref_invoice:
                desc = desc.replace("{" + line.ref_invoice + "}", ids.get("inv", line.ref_invoice))
            items.append({
                "line_no": n, "sku": line.sku, "description": desc, "quantity": line.quantity,
                "unit_price_minor": line.unit_price_minor, "amount_minor": line.amount_minor,
                "delivery_note_id": ids.get("dn", line.delivery_note),
                "ref_invoice_id": ids.get("inv", line.ref_invoice) if line.ref_invoice else None,
            })
        rec = {
            "doc_id": ids.get("doc", "i" + inv.key), "invoice_id": ids.get("inv", inv.key),
            "entity_id": ids.get("cust", inv.customer),
            "issued_at": iso(inv.issued, inv.offset),
            "due_at": iso(inv.issued + timedelta(days=inv.due_days), inv.offset),
            "currency": inv.currency, "total_minor": inv.total_minor, "line_items": items,
        }
        invoice_docs.append((sort_key(inv.issued, order_r.random()), rec))
    invoice_docs.sort(key=lambda x: x[0])

    payment_docs = []
    for pay in h.payments.values():
        rec = {
            "doc_id": ids.get("doc", "p" + pay.key), "payment_id": ids.get("pay", pay.key),
            "timestamp": iso(pay.ts, pay.offset), "currency": pay.currency, "amount_minor": pay.amount_minor,
            "invoice_refs": [ids.get("inv", k) for k in pay.refs] if pay.refs is not None else None,
        }
        payment_docs.append((sort_key(pay.ts, order_r.random()), rec))
    payment_docs.sort(key=lambda x: x[0])

    ledger_rows = []
    for e, ev in enumerate(events):
        tie = order_r.random()
        for k, row in enumerate(ev.rows):
            rec = {
                "row_id": row_ids[(e, k)], "timestamp": iso(ev.ts, h.local), "account": row.account,
                "debit_minor": row.debit, "credit_minor": row.credit, "currency": "KZT",
                "entity_id": ids.get("cust", row.entity) if row.entity else None,
                "invoice_id": ids.get("inv", row.invoice) if row.invoice else None,
                "payment_id": ids.get("pay", row.payment) if row.payment else None,
            }
            key = (order_r.random(),) if shuffled else (ev.ts.astimezone(timezone.utc), tie, k)
            ledger_rows.append((key, rec))
    ledger_rows.sort(key=lambda x: x[0])

    fx_rows = [(d.isoformat(), s, t, f"{rate:.2f}") for d, s, t, rate in h.fx.rows]
    if shuffled:
        order_r.shuffle(fx_rows)

    manifest = {
        "schema_version": SCHEMA_VERSION,
        "episode_id": episode_id,
        "base_currency": "KZT",
        "period_start": h.period_start.isoformat(),
        "period_end": h.period_end.isoformat(),
        "timezone": cfg["timezone"],
        "currency_exponents": cfg["currency_exponents"],
        "counts": {"ledger": len(ledger_rows), "invoices": len(invoice_docs), "payments": len(payment_docs),
                   "fx": len(fx_rows), "documents": len(invoice_docs) + len(payment_docs)},
        "rounding": "half_up",
    }

    pub, priv = Path(out) / "public", Path(out) / "private"
    pub.mkdir(parents=True, exist_ok=True)
    priv.mkdir(parents=True, exist_ok=True)
    _json(pub / "manifest.json", manifest)
    _json(pub / "policy.json", POLICY)
    _jsonl(pub / "invoices.jsonl", [r for _, r in invoice_docs])
    _jsonl(pub / "payments.jsonl", [r for _, r in payment_docs])
    with open(pub / "ledger.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(LEDGER_COLUMNS)
        for _, r in ledger_rows:
            w.writerow(["" if r[c] is None else r[c] for c in LEDGER_COLUMNS])
    with open(pub / "fx.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(FX_COLUMNS)
        w.writerows(fx_rows)

    issues, changes = _truth(planned or [], ids, events, row_ids, h)
    _json(priv / "truth.json", {"schema_version": SCHEMA_VERSION, "episode_id": episode_id,
                                "issues": issues})
    distractors = []
    for d in h.distractors:
        distractors.append({k: _public_ref(ids, v) for k, v in d.items()})
    _json(priv / "provenance.json", {
        "episode_id": episode_id, "generator_version": GENERATOR_VERSION,
        "decisions_version": DECISIONS_VERSION, "plan": plan or [], "attempt": attempt,
        "changes": changes, "distractors": distractors,
    })
    _json(priv / "seed_config.json", {"seed": h.seed, "config": cfg, "generator_version": GENERATOR_VERSION})
    return {"ids": ids, "rows": row_ids, "episode_id": episode_id, "issues": issues}


def _truth(planned, ids: IdMap, events, row_ids, h: History):
    """Planned errors (internal keys) -> truth issues and provenance changes (public ids)."""
    event_at = {(ev.kind, ev.ref): e for e, ev in enumerate(events)}

    def ref(item):
        if item[0] == "doc_inv":
            return ids.get("doc", "i" + item[1])
        if item[0] == "doc_pay":
            return ids.get("doc", "p" + item[1])
        if item[0] == "fx":
            return item[1]
        _, kind, key, role = item
        e = event_at[(kind, key)]
        return row_ids[(e, events[e].named[role])]

    def business(kind, key):
        return ids.get(kind, key)

    rendered = []
    for p in planned:
        affected = sorted(business(k, key) for k, key in p.affected)
        evidence = [sorted(ref(x) for x in group) for group in p.evidence]
        rendered.append((p, affected, evidence))
    rendered.sort(key=lambda x: (x[0].type, x[1]))
    issues, changes = [], []
    for n, (p, affected, evidence) in enumerate(rendered, 1):
        issue_id = f"ISS-{n:02d}"
        issues.append({"issue_id": issue_id, "type": p.type, "affected_ids": affected,
                       "expected_amount_minor": p.amount, "currency": "KZT", "evidence_sets": evidence})
        touched = sorted(set(affected) | {x for group in evidence for x in group})
        changes.append({"issue_id": issue_id, "kind": p.type, "scenario": p.scenario, **p.change,
                        "touched_ids": touched})
    return issues, changes


def _public_ref(ids: IdMap, value):
    if isinstance(value, list):
        return [_public_ref(ids, v) for v in value]
    if isinstance(value, str) and ":" in value:
        kind = value.split(":")[0]
        if kind in ("inv", "pay"):
            return ids.get(kind, value)
    return value


def _json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _jsonl(path: Path, rows) -> None:
    path.write_text("".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n" for r in rows),
                    encoding="utf-8")
