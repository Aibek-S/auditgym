"""Matcher and official reward (issue #5): reference values, normalization, attacks."""

from __future__ import annotations

from pathlib import Path

import pytest

from auditgym.episode import load_private, load_public
from auditgym.matcher import reward, score

FIX = Path(__file__).parent / "fixtures"


def ep(name):
    return load_public(FIX / name), load_private(FIX / name)["truth"]


def oracle_findings(truth, evidence_index=0):
    return [{"type": i["type"], "affected_ids": list(i["affected_ids"]), "claimed_amount_minor": i["expected_amount_minor"],
             "currency": i["currency"], "evidence_ids": list(i["evidence_sets"][evidence_index]), "explanation": "x"}
            for i in truth["issues"]]


def sub(truth, findings):
    return {"episode_id": truth["episode_id"], "findings": findings}


def fake_truth(n):
    issues = [{"issue_id": f"ISS-{k:02d}", "type": "duplicate_invoice", "affected_ids": [f"INV-{k}", f"INV-{k}b"],
               "expected_amount_minor": 1_000_000 + k, "currency": "KZT", "evidence_sets": [[f"DOC-{k}"]]}
              for k in range(n)]
    return {"episode_id": "e", "issues": issues}


EMPTY_PUB = {"invoices": [], "payments": [], "policy": {"amount_tolerance_minor": 100}}


# --- reference values from DECISIONS section 10 ------------------------------

@pytest.mark.parametrize("steps,expected", [(40, 0.92), (20, 0.96), (60, 0.88)])
def test_perfect_answer(steps, expected):
    pub, truth = ep("duplicate")
    s = score(sub(truth, oracle_findings(truth)), truth, pub, steps)
    assert s["f1"] == 1 and s["reward"] == pytest.approx(expected)


def test_silence_on_errors_and_on_clean():
    pub, truth = ep("duplicate")
    assert score(sub(truth, []), truth, pub, 10)["reward"] == -1.0
    pub, truth = ep("clean")
    s = score(sub(truth, []), truth, pub, 10)
    assert s["f1"] == 1 and s["reward"] == pytest.approx(0.98)


def test_false_finding_on_clean():
    pub, truth = ep("clean")
    _, dup_truth = ep("duplicate")
    s = score(sub(truth, oracle_findings(dup_truth)), truth, pub, 5)
    assert s["f1"] == 0 and s["reward"] == -1.0


def test_flag_everything_is_bad():
    truth = fake_truth(3)
    good = [{"type": "duplicate_invoice", "affected_ids": i["affected_ids"], "claimed_amount_minor": i["expected_amount_minor"],
             "currency": "KZT", "evidence_ids": i["evidence_sets"][0], "explanation": ""} for i in truth["issues"]]
    noise = [{**good[0], "affected_ids": [f"INV-X{k}"]} for k in range(27)]
    s = score(sub(truth, good + noise), truth, EMPTY_PUB, 30)
    assert s["tp"] == 3 and s["fp"] == 27 and s["f1"] == pytest.approx(6 / 33)
    assert s["reward"] == pytest.approx(2 * 6 / 33 - 1 - 0.06)  # -0.696...
    assert s["reward"] < score(sub(truth, []), truth, EMPTY_PUB, 30)["reward"] + 0.4


def test_correct_ids_without_evidence():
    pub, truth = ep("duplicate")
    f = oracle_findings(truth)
    f[0]["evidence_ids"] = []
    assert score(sub(truth, f), truth, pub, 10)["reward"] == -1.0


def test_malformed():
    pub, truth = ep("duplicate")
    for bad in (None, [], {"episode_id": truth["episode_id"]}, sub(truth, [{"type": "x"}]),
                {"episode_id": "wrong", "findings": []}):
        s = score(bad, truth, pub, 3)
        assert s["reward"] == -1.0 and s["malformed"]


# --- matching rules -----------------------------------------------------------

def test_repeated_finding_is_fp():
    pub, truth = ep("duplicate")
    f = oracle_findings(truth)
    s = score(sub(truth, f + f), truth, pub, 10)
    assert s["tp"] == 1 and s["fp"] == 1 and s["reward"] < score(sub(truth, f), truth, pub, 10)["reward"]


def test_every_evidence_set_works_and_extra_ids_allowed():
    pub, truth = ep("allocation")
    for k in range(len(truth["issues"][0]["evidence_sets"])):
        f = oracle_findings(truth, k)
        f[0]["evidence_ids"] += [pub["ledger"][0]["row_id"]]
        assert score(sub(truth, f), truth, pub, 0)["tp"] == 1


def test_partial_evidence_does_not_match():
    pub, truth = ep("allocation")
    f = oracle_findings(truth)
    f[0]["evidence_ids"] = f[0]["evidence_ids"][:-1]
    assert score(sub(truth, f), truth, pub, 0)["tp"] == 0


def test_normalization():
    pub, truth = ep("duplicate")
    f = oracle_findings(truth)[0]
    docs = {i["invoice_id"]: i["doc_id"] for i in pub["invoices"]}
    biz = {i["doc_id"]: i["invoice_id"] for i in pub["invoices"]}
    variant = {**f, "type": " Duplicate-Invoice ", "currency": "kzt",
               "affected_ids": [docs[x] for x in reversed(f["affected_ids"])] + [f["affected_ids"][0]],
               "evidence_ids": [biz.get(x, x) for x in f["evidence_ids"]],
               "claimed_amount_minor": f["claimed_amount_minor"] + 100, "explanation": "y" * 1000}
    assert score(sub(truth, [variant]), truth, pub, 0)["tp"] == 1
    assert score(sub(truth, [{**variant, "type": "duplicate"}]), truth, pub, 0)["tp"] == 1


@pytest.mark.parametrize("change", [
    {"claimed_amount_minor": "+101"}, {"currency": "USD"}, {"type": "fx_conversion"}, {"type": "made_up_type"},
    {"affected_ids": "first_only"}, {"affected_ids": "guessed"},
])
def test_wrong_fields_do_not_match(change):
    pub, truth = ep("duplicate")
    f = oracle_findings(truth)[0]
    key, value = next(iter(change.items()))
    if value == "+101":
        f[key] += 101
    elif value == "first_only":
        f[key] = f[key][:1]
    elif value == "guessed":
        f[key] = ["INV-GUESS1", "INV-GUESS2"]
    else:
        f[key] = value
    s = score(sub(truth, [f]), truth, pub, 0)
    assert s["tp"] == 0 and s["fp"] == 1 and not s["malformed"]


def test_explanation_never_matters():
    pub, truth = ep("duplicate")
    a, b = oracle_findings(truth), oracle_findings(truth)
    b[0]["explanation"] = "I am certain, trust me, this is definitely correct" * 10
    assert score(sub(truth, a), truth, pub, 7) == score(sub(truth, b), truth, pub, 7)


def test_matching_is_order_independent_and_maximal():
    truth = fake_truth(2)
    base = [{"type": "duplicate_invoice", "affected_ids": i["affected_ids"], "claimed_amount_minor": i["expected_amount_minor"],
             "currency": "KZT", "evidence_ids": i["evidence_sets"][0], "explanation": ""} for i in truth["issues"]]
    for order in (base, base[::-1]):
        assert score(sub(truth, order), truth, EMPTY_PUB, 0)["tp"] == 2


def test_step_cost_only_slightly_separates_equal_answers():
    assert reward(1.0, 10) - reward(1.0, 60) == pytest.approx(0.1)
    assert reward(1.0, 0) == 1.0 and reward(0.0, 999) == -1.0
