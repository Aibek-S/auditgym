"""Error injection and ground truth (issue #3).

Every test works from the rendered files, the same way the jury will: violations recomputed
from public files must equal truth exactly, and each evidence set must reproduce the amount.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import pytest

from auditgym.episode import load_private, load_public
from auditgym.generate import GenerationError, generate, load_config
from auditgym.history import build_history
from auditgym.invariants import check, evidence_amount, verify_episode

TYPES = ["duplicate_invoice", "payment_allocation", "fx_conversion", "period_cutoff"]
PLANS = [[t] for t in TYPES] + [["I1"], ["I2"]]
SEEDS = range(1, 13)


@pytest.fixture(scope="module")
def forced(tmp_path_factory):
    """Each single type and each interacting scenario forced on 12 seeds."""
    root = tmp_path_factory.mktemp("forced")
    out = {}
    for plan in PLANS:
        cfg = load_config(errors={"plan": plan})
        for seed in SEEDS:
            path = root / f"{plan[0]}-{seed}"
            try:
                generate(seed, cfg, path)
            except GenerationError:
                # I1 is impossible only when the period ends on Sat/Sun: both the UTC date and the
                # local date then use Friday's rate, so the FX error would be zero.
                end = build_history(seed, cfg).period_end.date()
                assert plan == ["I1"] and end.weekday() in (5, 6), (plan, seed, end)
                continue
            out[(plan[0], seed)] = path
    return out


@pytest.fixture(scope="module")
def mixed(tmp_path_factory):
    """Default config: random mix of clean, single and interacting episodes."""
    root = tmp_path_factory.mktemp("mixed")
    cfg = load_config()
    for seed in range(1, 61):
        generate(seed, cfg, root / str(seed))
    return root


def issues(path):
    return load_private(path)["truth"]["issues"]


@pytest.mark.parametrize("plan", PLANS, ids=lambda p: p[0])
def test_forced_plan_is_placed_and_verified(forced, plan):
    placed = [s for s in SEEDS if (plan[0], s) in forced]
    assert len(placed) >= 8, placed
    for seed in placed:
        path = forced[(plan[0], seed)]
        found = Counter(i["type"] for i in issues(path))
        if plan[0] == "I1":
            assert found == Counter({"period_cutoff": 1, "fx_conversion": 1}), seed
        elif plan[0] == "I2":
            assert found == Counter({"duplicate_invoice": 1, "payment_allocation": 1}), seed
        else:
            assert found == Counter({plan[0]: 1}), seed
        assert verify_episode(load_public(path), load_private(path)["truth"]) == [], seed


def test_interacting_issues_share_records(forced):
    for seed in SEEDS:
        if ("I1", seed) not in forced:
            continue
        i1 = issues(forced[("I1", seed)])
        assert i1[0]["affected_ids"] == i1[1]["affected_ids"]  # one invoice, two independent issues
        i2 = {i["type"]: set(i["affected_ids"]) for i in issues(forced[("I2", seed)])}
        assert i2["duplicate_invoice"] & i2["payment_allocation"]  # the duplicated invoice is the underpaid one
        prov = load_private(forced[("I2", seed)])["provenance"]
        assert {c["scenario"] for c in prov["changes"]} == {"I2"}


def test_mixed_episodes_verify_and_cover_everything(mixed):
    types, clean, interacting, counts = Counter(), 0, 0, []
    for seed in range(1, 61):
        path = mixed / str(seed)
        pub, priv = load_public(path), load_private(path)
        assert verify_episode(pub, priv["truth"]) == [], seed
        ii = priv["truth"]["issues"]
        counts.append(len(ii))
        clean += not ii
        interacting += any(c["scenario"] for c in priv["provenance"]["changes"])
        types.update(i["type"] for i in ii)
        assert len(ii) <= 12
    assert set(types) == set(TYPES)
    assert clean >= 8 and interacting >= 8
    assert max(counts) >= 4


def test_clean_episodes_have_no_violations(mixed):
    for seed in range(1, 61):
        path = mixed / str(seed)
        if not issues(path):
            assert check(load_public(path)) == []


def test_amounts_are_kzt_and_above_minimum(mixed):
    for seed in range(1, 61):
        for i in issues(mixed / str(seed)):
            assert i["currency"] == "KZT" and i["expected_amount_minor"] >= 1_000_000
            assert 1 <= len(i["evidence_sets"]) <= 3 and all(len(e) <= 10 for e in i["evidence_sets"])


def test_wrong_evidence_does_not_prove(forced):
    """Swapping in an unrelated ledger row or dropping a document breaks the proof."""
    for (plan, seed), path in forced.items():
        if plan in ("I1", "I2") or seed > 4:
            continue
        pub = load_public(path)
        issue = issues(path)[0]
        evidence = issue["evidence_sets"][0]
        rows = {r["row_id"] for r in pub["ledger"]}
        unrelated = next(r["row_id"] for r in pub["ledger"] if r["account"] in ("5000", "2000"))
        swapped = [unrelated if x in rows else x for x in evidence]
        assert evidence_amount(issue["type"], swapped, pub) is None, (plan, seed)
        dropped = [x for x in evidence if x not in rows]
        assert evidence_amount(issue["type"], dropped, pub) is None, (plan, seed)


def test_distractors_survive_injection(mixed):
    for seed in range(1, 61):
        prov = load_private(mixed / str(seed))["provenance"]
        touched = {x for c in prov["changes"] for x in c["touched_ids"]}
        protected = set()
        for d in prov["distractors"]:
            if d["kind"] in ("recurring_order", "opening_balance", "partial_payment_foreign", "large_foreign_order"):
                continue
            for v in d.values():
                protected.update(v if isinstance(v, list) else [v])
        assert not touched & protected, (seed, touched & protected)


def test_no_shortcut_features(mixed):
    """Neither alternative wording nor a booking lag alone marks an error."""
    alt_words, lag = 0, 0
    for seed in range(1, 31):
        path = mixed / str(seed)
        pub = load_public(path)
        affected = {x for i in issues(path) for x in i["affected_ids"]}
        clean_invoices = [i for i in pub["invoices"] if i["invoice_id"] not in affected and i["total_minor"] > 0]
        alt_words += sum(any("," in x["description"] or " l" in x["description"] for x in i["line_items"])
                         for i in clean_invoices)
        booked = {r["invoice_id"]: r["timestamp"] for r in pub["ledger"] if r["account"] == "4000"}
        lag += sum(booked.get(i["invoice_id"]) not in (None, i["issued_at"]) and i["issued_at"].endswith("+05:00")
                   for i in clean_invoices)
    assert alt_words > 50 and lag > 50


def test_same_seed_same_errors(tmp_path):
    cfg = load_config()
    for seed in (4, 9):
        generate(seed, cfg, tmp_path / "a")
        generate(seed, cfg, tmp_path / "b")
        for name in ("public/ledger.csv", "public/invoices.jsonl", "private/truth.json", "private/provenance.json"):
            assert (tmp_path / "a" / name).read_bytes() == (tmp_path / "b" / name).read_bytes(), (seed, name)


def test_paired_transform_keeps_truth_up_to_ids(tmp_path):
    for seed in (2, 6, 11):
        cfg = load_config()
        generate(seed, cfg, tmp_path / "base")
        generate(seed, load_config(id_salt="pair", order_mode="shuffled"), tmp_path / "pair")
        a, b = issues(tmp_path / "base"), issues(tmp_path / "pair")
        assert sorted((i["type"], i["expected_amount_minor"]) for i in a) == \
               sorted((i["type"], i["expected_amount_minor"]) for i in b), seed
        assert verify_episode(load_public(tmp_path / "pair"), load_private(tmp_path / "pair")["truth"]) == []


def test_no_truth_leaks_into_public(mixed):
    for seed in range(1, 61):
        path = mixed / str(seed)
        text = "".join(p.read_text(encoding="utf-8") for p in (path / "public").iterdir())
        priv = load_private(path)
        tokens = ["ISS-", "scenario", "provenance", "evidence_sets", "clerk", ":e0", ":e1", "inv:", "pay:"]
        tokens += [c["decision"] for c in priv["provenance"]["changes"]]
        tokens += [str(priv["seed_config"]["seed"]) + ":errors"]
        for token in tokens:
            assert token not in text, (seed, token)
        assert '"seed"' not in text
