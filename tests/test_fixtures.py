"""Checks the three hand-designed fixture episodes (issue #1).

They are the contract between the data track (#2, #3) and the environment track (#4, #5),
so this test pins the file format from docs/DECISIONS.md sections 2, 4, 5 and 11.
"""

from __future__ import annotations

import csv
import filecmp
import importlib.util
import json
from collections import defaultdict
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"
EPISODES = ["clean", "duplicate", "allocation"]
PUBLIC_FILES = {"manifest.json", "ledger.csv", "invoices.jsonl", "payments.jsonl", "fx.csv", "policy.json"}
PRIVATE_FILES = {"truth.json", "provenance.json", "seed_config.json"}

LEDGER_COLUMNS = ["row_id", "timestamp", "account", "debit_minor", "credit_minor",
                  "currency", "entity_id", "invoice_id", "payment_id"]
INVOICE_KEYS = {"doc_id", "invoice_id", "entity_id", "issued_at", "due_at", "currency", "total_minor", "line_items"}
LINE_KEYS = {"line_no", "sku", "description", "quantity", "unit_price_minor", "amount_minor",
             "delivery_note_id", "ref_invoice_id"}
PAYMENT_KEYS = {"doc_id", "payment_id", "timestamp", "currency", "amount_minor", "invoice_refs"}
MANIFEST_KEYS = {"schema_version", "episode_id", "base_currency", "period_start", "period_end",
                 "timezone", "currency_exponents", "counts", "rounding"}
ISSUE_KEYS = {"issue_id", "type", "affected_ids", "expected_amount_minor", "currency", "evidence_sets"}
TYPES = {"duplicate_invoice", "payment_allocation", "fx_conversion", "period_cutoff"}
ACCOUNTS = {"1010", "1020", "1030", "1200", "1900", "2000", "2100", "3900", "4000", "4100", "5000", "7000"}


def load(name: str) -> dict:
    root = FIXTURES / name
    read_jsonl = lambda p: [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines()]  # noqa: E731
    with open(root / "public/ledger.csv", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        header = reader.fieldnames
        ledger = [{k: (v if v != "" else None) for k, v in row.items()} for row in reader]
    with open(root / "public/fx.csv", newline="", encoding="utf-8") as f:
        fx = list(csv.DictReader(f))
    return {
        "root": root,
        "ledger_header": header,
        "ledger": ledger,
        "fx": fx,
        "invoices": read_jsonl(root / "public/invoices.jsonl"),
        "payments": read_jsonl(root / "public/payments.jsonl"),
        "manifest": json.loads((root / "public/manifest.json").read_text(encoding="utf-8")),
        "policy": json.loads((root / "public/policy.json").read_text(encoding="utf-8")),
        "truth": json.loads((root / "private/truth.json").read_text(encoding="utf-8")),
        "provenance": json.loads((root / "private/provenance.json").read_text(encoding="utf-8")),
    }


@pytest.fixture(params=EPISODES)
def ep(request):
    return load(request.param)


def ts(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    assert parsed.tzinfo is not None, f"timestamp without offset: {value}"
    return parsed


def rate_for(ep, currency: str, local_day) -> Decimal:
    best = None
    for row in ep["fx"]:
        if row["source_currency"] == currency and row["date"] <= local_day.isoformat():
            best = Decimal(row["rate"])
    assert best is not None
    return best


def to_kzt(ep, amount: int, currency: str, when: str) -> int:
    if currency == "KZT":
        return amount
    local_tz = ts(ep["manifest"]["period_start"]).tzinfo
    day = ts(when).astimezone(local_tz).date()
    return int((Decimal(amount) * rate_for(ep, currency, day)).quantize(Decimal(1), rounding=ROUND_HALF_UP))


# --- format -----------------------------------------------------------------

def test_files_present(ep):
    assert {p.name for p in (ep["root"] / "public").iterdir()} == PUBLIC_FILES
    assert {p.name for p in (ep["root"] / "private").iterdir()} == PRIVATE_FILES


def test_manifest(ep):
    m = ep["manifest"]
    assert set(m) == MANIFEST_KEYS
    assert m["schema_version"] == "1.0" and m["base_currency"] == "KZT" and m["timezone"] == "+05:00"
    assert ts(m["period_start"]) < ts(m["period_end"])
    assert m["counts"] == {
        "ledger": len(ep["ledger"]), "invoices": len(ep["invoices"]), "payments": len(ep["payments"]),
        "fx": len(ep["fx"]), "documents": len(ep["invoices"]) + len(ep["payments"]),
    }
    assert m["episode_id"] == ep["truth"]["episode_id"]


def test_ledger_format(ep):
    assert ep["ledger_header"] == LEDGER_COLUMNS
    for r in ep["ledger"]:
        ts(r["timestamp"])
        assert r["account"] in ACCOUNTS
        assert r["currency"] == "KZT"  # D-10
        dr, cr = int(r["debit_minor"]), int(r["credit_minor"])
        assert dr >= 0 and cr >= 0 and (dr == 0) != (cr == 0)


def test_documents_format(ep):
    for inv in ep["invoices"]:
        assert set(inv) == INVOICE_KEYS
        ts(inv["issued_at"]), ts(inv["due_at"])
        assert isinstance(inv["total_minor"], int)
        for line in inv["line_items"]:
            assert set(line) == LINE_KEYS
            assert line["amount_minor"] == line["quantity"] * line["unit_price_minor"]
    for pay in ep["payments"]:
        assert set(pay) == PAYMENT_KEYS
        ts(pay["timestamp"])
        assert isinstance(pay["amount_minor"], int) and pay["amount_minor"] > 0
        assert pay["invoice_refs"] is None or isinstance(pay["invoice_refs"], list)
    for row in ep["fx"]:
        assert row["target_currency"] == "KZT"
        assert len(row["rate"].split(".")[1]) == 2


def test_ids_unique(ep):
    ids = ([r["row_id"] for r in ep["ledger"]] + [i["doc_id"] for i in ep["invoices"]]
           + [i["invoice_id"] for i in ep["invoices"]] + [p["doc_id"] for p in ep["payments"]]
           + [p["payment_id"] for p in ep["payments"]])
    assert len(ids) == len(set(ids))


# --- accounting invariants (DECISIONS section 4) ---------------------------

def test_inv1_events_balance(ep):
    events = defaultdict(int)
    for r in ep["ledger"]:
        key = (r["timestamp"], r["payment_id"]) if r["payment_id"] else (r["timestamp"], r["invoice_id"])
        events[key] += int(r["debit_minor"]) - int(r["credit_minor"])
    assert all(v == 0 for v in events.values())


def test_inv2_invoice_totals(ep):
    for inv in ep["invoices"]:
        assert inv["total_minor"] == sum(x["amount_minor"] for x in inv["line_items"])


def test_inv4_bank_matches_payment_documents(ep):
    for pay in ep["payments"]:
        bank = [r for r in ep["ledger"] if r["payment_id"] == pay["payment_id"] and r["account"] in {"1010", "1020", "1030"}]
        assert len(bank) == 1
        assert int(bank[0]["debit_minor"]) == to_kzt(ep, pay["amount_minor"], pay["currency"], pay["timestamp"])


def test_inv6_references_resolve(ep):
    inv_ids = {i["invoice_id"] for i in ep["invoices"]}
    pay_ids = {p["payment_id"] for p in ep["payments"]}
    for r in ep["ledger"]:
        assert r["invoice_id"] is None or r["invoice_id"] in inv_ids
        assert r["payment_id"] is None or r["payment_id"] in pay_ids
    for p in ep["payments"]:
        assert all(ref in inv_ids for ref in (p["invoice_refs"] or []))
    for inv in ep["invoices"]:
        assert all(x["ref_invoice_id"] in inv_ids for x in inv["line_items"] if x["ref_invoice_id"])


def test_inv5_inv7_revenue_in_period_and_converted(ep):
    start, end = ts(ep["manifest"]["period_start"]), ts(ep["manifest"]["period_end"])
    by_id = {i["invoice_id"]: i for i in ep["invoices"]}
    for r in ep["ledger"]:
        if r["account"] == "4000":
            inv = by_id[r["invoice_id"]]
            assert (start <= ts(inv["issued_at"]) < end) == (start <= ts(r["timestamp"]) < end)
            assert int(r["credit_minor"]) == to_kzt(ep, inv["total_minor"], inv["currency"], inv["issued_at"])


# --- truth and isolation ----------------------------------------------------

EXPECTED_ISSUES = {"clean": [], "duplicate": ["duplicate_invoice"], "allocation": ["payment_allocation"]}


@pytest.mark.parametrize("name", EPISODES)
def test_truth_shape(name):
    ep = load(name)
    issues = ep["truth"]["issues"]
    assert [i["type"] for i in issues] == EXPECTED_ISSUES[name]
    public_ids = ({r["row_id"] for r in ep["ledger"]} | {i["doc_id"] for i in ep["invoices"]}
                  | {p["doc_id"] for p in ep["payments"]}
                  | {f'{r["date"]}:{r["source_currency"]}:{r["target_currency"]}' for r in ep["fx"]})
    business_ids = {i["invoice_id"] for i in ep["invoices"]} | {p["payment_id"] for p in ep["payments"]}
    for issue in issues:
        assert set(issue) == ISSUE_KEYS and issue["type"] in TYPES
        assert issue["currency"] == "KZT" and issue["expected_amount_minor"] >= 1_000_000  # D-31, D-32
        assert set(issue["affected_ids"]) <= business_ids
        assert 1 <= len(issue["evidence_sets"]) <= 3
        for evidence in issue["evidence_sets"]:
            assert set(evidence) <= public_ids and len(evidence) <= 10


def test_duplicate_is_provable_from_evidence():
    """Independent checker (D-37): the evidence alone shows the duplicate and its amount."""
    ep = load("duplicate")
    issue = ep["truth"]["issues"][0]
    docs = {i["doc_id"]: i for i in ep["invoices"]}
    rows = {r["row_id"]: r for r in ep["ledger"]}
    for evidence in issue["evidence_sets"]:
        a, b = (docs[x] for x in evidence if x in docs)
        row = next(rows[x] for x in evidence if x in rows)
        goods = lambda inv: sorted((x["sku"], x["quantity"], x["delivery_note_id"]) for x in inv["line_items"])  # noqa: E731
        assert goods(a) == goods(b) and a["entity_id"] == b["entity_id"]
        assert a["invoice_id"] != b["invoice_id"]
        assert row["invoice_id"] in {a["invoice_id"], b["invoice_id"]}
        assert int(row["debit_minor"]) + int(row["credit_minor"]) == issue["expected_amount_minor"]
    # D-14a: no credit note reverses either invoice
    reversed_ids = {x["ref_invoice_id"] for i in ep["invoices"] for x in i["line_items"] if x["ref_invoice_id"]}
    assert not reversed_ids & set(issue["affected_ids"])
    # D-14a: the copy is not a byte-for-byte match (re-worded lines)
    a, b = (docs[x] for x in issue["evidence_sets"][0] if x in docs)
    assert a["line_items"] != b["line_items"]


def test_allocation_is_provable_from_evidence():
    ep = load("allocation")
    issue = ep["truth"]["issues"][0]
    docs = {d["doc_id"]: d for d in ep["invoices"] + ep["payments"]}
    rows = {r["row_id"]: r for r in ep["ledger"]}
    for evidence in issue["evidence_sets"]:
        pay = next(docs[x] for x in evidence if x in docs and "payment_id" in docs[x])
        inv = next(docs[x] for x in evidence if x in docs and "invoice_id" in docs[x] and "payment_id" not in docs[x])
        row = next(rows[x] for x in evidence if x in rows)
        assert inv["invoice_id"] in pay["invoice_refs"] and pay["amount_minor"] >= inv["total_minor"]
        assert row["payment_id"] == pay["payment_id"]
        if row["account"] == "1900":
            assert int(row["credit_minor"]) == issue["expected_amount_minor"]
        else:
            assert row["account"] == "1200"
            assert inv["total_minor"] - int(row["credit_minor"]) == issue["expected_amount_minor"]


def test_clean_has_no_unexplained_suspense():
    """In the clean episode every 1900 credit belongs to a payment with no invoice reference."""
    ep = load("clean")
    pays = {p["payment_id"]: p for p in ep["payments"]}
    for r in ep["ledger"]:
        if r["account"] == "1900":
            assert pays[r["payment_id"]]["invoice_refs"] is None


@pytest.mark.parametrize("name", EPISODES)
def test_no_truth_in_public_files(name):
    ep = load(name)
    public_text = "".join(p.read_text(encoding="utf-8") for p in (ep["root"] / "public").iterdir())
    # Type names are public (the agent submits them), so they are not secret tokens.
    # Secret: issue ids, provenance/truth wording, how the episode was built.
    secrets = ["ISS-", "provenance", "truth", "fixture", "clerk", "evidence_sets", "expected_amount"]
    secrets += [c["decision"] for c in ep["provenance"]["changes"]]
    for token in secrets:
        assert token not in public_text, token


def test_fixtures_are_reproducible(tmp_path):
    spec = importlib.util.spec_from_file_location("build_fixtures", FIXTURES / "build_fixtures.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.OUT = tmp_path
    module.build_clean(), module.build_duplicate(), module.build_allocation()
    for name in EPISODES:
        for sub, files in (("public", PUBLIC_FILES), ("private", PRIVATE_FILES)):
            match, mismatch, errors = filecmp.cmpfiles(FIXTURES / name / sub, tmp_path / name / sub,
                                                       sorted(files), shallow=False)
            assert not mismatch and not errors, (name, sub, mismatch, errors)


def test_cli_help_runs():
    from auditgym.cli import main
    assert main([]) == 0
