"""Clean generator (issue #2): invariants, sizes, determinism, variation, distractors."""

from __future__ import annotations

import filecmp
import json
from collections import Counter
from pathlib import Path

import pytest

from auditgym.episode import PRIVATE_FILES, PUBLIC_FILES, load_public
from auditgym.generate import generate, load_config
from auditgym.invariants import check

SEEDS = range(1, 51)
CONFIG = load_config(errors={"plan": []})  # #2 tests check clean companies
REQUIRED_DISTRACTORS = {
    "recurring_order", "correction_reissue", "partial_return", "split_invoicing",
    "same_total_other_customer", "boundary_last_evening", "boundary_next_period_utc",
    "utc_date_differs", "combined_payment", "split_payment", "underpaid_open_invoice",
    "overpayment_to_1900", "no_reference_payment", "realised_fx_difference", "opening_balance",
    "large_foreign_order",
}


@pytest.fixture(scope="module")
def episodes(tmp_path_factory):
    root = tmp_path_factory.mktemp("episodes")
    for seed in SEEDS:
        generate(seed, CONFIG, root / str(seed))
    return root


def test_all_invariants_pass(episodes):
    failures = {seed: check(load_public(episodes / str(seed)))[:3] for seed in SEEDS}
    assert {s: v for s, v in failures.items() if v} == {}


def test_sizes_within_limits(episodes):
    for seed in SEEDS:
        c = load_public(episodes / str(seed))["manifest"]["counts"]
        assert CONFIG["size"]["ledger_rows"][0] <= c["ledger"] <= CONFIG["hard_limits"]["ledger_rows"], seed
        assert 20 <= c["documents"] <= CONFIG["hard_limits"]["documents"] - CONFIG["errors"]["reserve_documents"], seed


def test_same_seed_is_byte_identical(tmp_path):
    for seed in (3, 17):
        generate(seed, CONFIG, tmp_path / "a")
        generate(seed, CONFIG, tmp_path / "b")
        for sub, names in (("public", PUBLIC_FILES), ("private", PRIVATE_FILES)):
            _, mismatch, errors = filecmp.cmpfiles(tmp_path / "a" / sub, tmp_path / "b" / sub, list(names), shallow=False)
            assert not mismatch and not errors, (seed, sub, mismatch)


def test_different_seeds_differ(episodes):
    starts = Counter(load_public(episodes / str(s))["manifest"]["period_start"] for s in SEEDS)
    assert len(starts) >= 15  # month and year vary by seed (D-09)
    ids = [load_public(episodes / str(s))["invoices"][0]["invoice_id"] for s in SEEDS]
    assert len(set(ids)) == len(ids)


def test_distractors_present_in_every_episode(episodes):
    for seed in SEEDS:
        prov = json.loads((episodes / str(seed) / "private/provenance.json").read_text())
        kinds = {d["kind"] for d in prov["distractors"]}
        assert REQUIRED_DISTRACTORS <= kinds, (seed, REQUIRED_DISTRACTORS - kinds)
        assert prov["changes"] == []
        assert json.loads((episodes / str(seed) / "private/truth.json").read_text())["issues"] == []


def test_currencies_and_offsets_vary(episodes):
    pub = load_public(episodes / "1")
    assert {i["currency"] for i in pub["invoices"]} == {"KZT", "USD", "EUR"}
    offsets = {i["issued_at"][-6:] for i in pub["invoices"]}
    assert offsets == {"+05:00", "+00:00"}
    assert any(p["invoice_refs"] is None for p in pub["payments"])
    assert any(r["account"] == "7000" for r in pub["ledger"])


def test_id_salt_and_shuffle_keep_data_valid(tmp_path):
    base = tmp_path / "base"
    generate(5, CONFIG, base)
    salted = tmp_path / "salted"
    generate(5, load_config(id_salt="paired-1", order_mode="shuffled", errors={"plan": []}), salted)
    a, b = load_public(base), load_public(salted)
    assert check(b) == []
    assert {i["invoice_id"] for i in a["invoices"]}.isdisjoint({i["invoice_id"] for i in b["invoices"]})
    # same business content, different ids/order
    assert sorted(i["total_minor"] for i in a["invoices"]) == sorted(i["total_minor"] for i in b["invoices"])
    assert sorted(r["debit_minor"] for r in a["ledger"]) == sorted(r["debit_minor"] for r in b["ledger"])
    assert a["manifest"]["counts"] == b["manifest"]["counts"]


def test_no_internal_keys_or_hidden_words_in_public(episodes):
    for seed in (1, 2, 3):
        text = "".join(p.read_text() for p in (episodes / str(seed) / "public").iterdir())
        for token in ("inv:", "pay:", "cust:", "dn:", "{inv", "distractor", "correction_reissue", "clerk"):
            assert token not in text, (seed, token)


def test_invariant_checker_detects_hand_injected_errors():
    """The checker works on public files only and reproduces exactly the declared issue."""
    fixtures = Path(__file__).parent / "fixtures"
    assert check(load_public(fixtures / "clean")) == []
    dup = check(load_public(fixtures / "duplicate"))
    assert [v.code for v in dup] == ["INV-8"]
    alloc = check(load_public(fixtures / "allocation"))
    assert [v.code for v in alloc] == ["INV-3"]
