"""Environment contract (issue #4): reset/step shapes, tools, errors, limits, modes, isolation."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from auditgym.calculator import CalcError, evaluate
from auditgym.env import ACTIONS, ERROR_CODES, AuditEnv
from auditgym.episode import load_private
from auditgym.generate import load_config

FIXTURES = Path(__file__).parent / "fixtures"
OBS_KEYS = {"ok", "result", "error", "steps_used", "steps_remaining"}


def fake_scorer(episode_dir, payload, steps):
    return {"reward": 0.5 if payload["findings"] else 0.25, "inspection_steps": steps}


def env_on(name="duplicate", **kw):
    env = AuditEnv(scorer=kw.pop("scorer", fake_scorer), **kw)
    obs, info = env.reset(episode_dir=FIXTURES / name)
    return env, obs, info


def submit(env, findings=()):
    return env.step({"action": "submit", "findings": {"episode_id": env.episode_id, "findings": list(findings)}})


def test_reset_shape():
    env, obs, info = env_on()
    assert set(obs) == OBS_KEYS and obs["ok"] and obs["steps_remaining"] == 100 and obs["steps_used"] == 0
    r = obs["result"]
    assert {"task", "manifest", "policy", "tables", "actions", "limits"} <= set(r)
    assert set(r["actions"]) == set(ACTIONS)
    assert info == {"episode_id": r["manifest"]["episode_id"], "schema_version": "1.0", "mode": "open", "steps_used": 0}


def test_step_shape_and_every_step_costs_one():
    env, *_ = env_on()
    for n, action in enumerate([{"action": "list_records", "table": "ledger"}, {"action": "nope"},
                                {"action": "calculator", "expression": "1/0"}], 1):
        obs, reward, term, trunc, info = env.step(action)
        assert set(obs) == OBS_KEYS and reward == 0.0 and not term and not trunc
        assert obs["steps_used"] == n and obs["steps_remaining"] == 100 - n


def test_pagination_limit_and_stable_cursor():
    env, *_ = env_on()
    obs, *_ = env.step({"action": "list_records", "table": "ledger", "limit": 500})
    page1 = obs["result"]
    assert len(page1["rows"]) == min(50, page1["total"])
    obs, *_ = env.step({"action": "list_records", "table": "ledger", "limit": 20})
    first = obs["result"]
    assert len(first["rows"]) == 20 and first["next_cursor"]
    a, *_ = env.step({"action": "list_records", "table": "ledger", "limit": 20, "cursor": first["next_cursor"]})
    b, *_ = env.step({"action": "list_records", "table": "ledger", "limit": 20, "cursor": first["next_cursor"]})
    assert a["result"]["rows"] == b["result"]["rows"] and a["result"]["offset"] == 20
    seen, cursor = [], None
    while True:
        obs, *_ = env.step({"action": "list_records", "table": "ledger", "limit": 7, "cursor": cursor})
        seen += [r["row_id"] for r in obs["result"]["rows"]]
        cursor = obs["result"]["next_cursor"]
        if cursor is None:
            break
    assert len(seen) == len(set(seen)) == first["total"]


def test_cursor_tampering_and_cross_table():
    env, *_ = env_on()
    obs, *_ = env.step({"action": "list_records", "table": "ledger", "limit": 5})
    cur = obs["result"]["next_cursor"]
    for bad in ("garbage", cur[:-2] + "AA", 123):
        o, *_ = env.step({"action": "list_records", "table": "ledger", "cursor": bad})
        assert o["error"]["code"] == "bad_cursor"
    o, *_ = env.step({"action": "list_records", "table": "invoices", "cursor": cur})
    assert o["error"]["code"] == "bad_cursor"


def test_invoice_list_hides_lines_document_shows_them():
    env, *_ = env_on()
    obs, *_ = env.step({"action": "list_records", "table": "invoices"})
    row = obs["result"]["rows"][0]
    assert "line_items" not in row
    obs, *_ = env.step({"action": "get_record", "table": "invoices", "id": row["invoice_id"]})
    assert "line_items" not in obs["result"]["record"]
    obs, *_ = env.step({"action": "get_document", "doc_id": row["doc_id"]})
    assert obs["result"]["kind"] == "invoice" and obs["result"]["document"]["line_items"]


def test_get_record_by_every_id_form():
    env, *_ = env_on()
    inv = env.tables["invoices"][0]
    pay = env.tables["payments"][0]
    fx = env.tables["fx"][0]
    row = env.tables["ledger"][0]
    for table, rid in (("invoices", inv["invoice_id"]), ("invoices", inv["doc_id"]), ("payments", pay["payment_id"]),
                       ("payments", pay["doc_id"]), ("fx", fx["fx_key"]), ("ledger", row["row_id"])):
        obs, *_ = env.step({"action": "get_record", "table": table, "id": rid})
        assert obs["ok"], (table, rid)
    obs, *_ = env.step({"action": "get_document", "doc_id": pay["doc_id"]})
    assert obs["result"]["kind"] == "payment"


@pytest.mark.parametrize("action,code", [
    ({"action": "drop_table"}, "unknown_action"),
    ("not a dict", "unknown_action"),
    ({"action": "list_records", "table": "truth"}, "unknown_table"),
    ({"action": "list_records", "table": "ledger", "limit": "5"}, "bad_arguments"),
    ({"action": "list_records", "table": "ledger", "path": "../private"}, "bad_arguments"),
    ({"action": "get_record", "table": "ledger", "id": "L-NOPE00"}, "not_found"),
    ({"action": "get_record", "table": "ledger", "id": 5}, "bad_arguments"),
    ({"action": "get_document", "doc_id": "../private/truth.json"}, "not_found"),
    ({"action": "calculator", "expression": "__import__('os')"}, "calc_error"),
])
def test_error_codes(action, code):
    env, *_ = env_on()
    obs, reward, term, trunc, _ = env.step(action)
    assert obs["ok"] is False and obs["error"]["code"] == code and obs["error"]["code"] in ERROR_CODES
    assert obs["steps_used"] == 1 and not term and not trunc and reward == 0.0
    assert "Traceback" not in obs["error"]["message"] and "/" not in obs["error"]["message"].replace("+ - * /", "")


def test_calculator_is_decimal_and_safe():
    assert evaluate("1.1 + 2.2") == "3.3"
    assert evaluate("100000 * 552.10") == "55210000"
    assert evaluate("-(2 - 5) * 3") == "9"
    assert evaluate("10 / 4") == "2.5"
    for bad in ("2**8", "abs(-1)", "1e5", "x+1", "1 // 2", "1 % 2", "import os", "1.2.3", "(1+2", "1" * 201,
                "(" * 30 + "1" + ")" * 30, "", None, "1/0", "9" * 31):
        with pytest.raises(CalcError):
            evaluate(bad)


def test_submit_terminates_open_mode_reward():
    env, *_ = env_on()
    env.step({"action": "list_records", "table": "ledger"})
    obs, reward, term, trunc, _ = submit(env, [])
    assert term and not trunc and obs["ok"] and reward == 0.25
    assert obs["result"]["inspection_steps"] == 1  # submit itself is not an inspection step (D-66)
    assert env.evaluator_log[-1]["inspection_steps"] == 1


def test_after_end_episode_over_no_charge():
    env, *_ = env_on()
    submit(env)
    obs, reward, term, trunc, info = env.step({"action": "list_records", "table": "ledger"})
    assert obs["error"]["code"] == "episode_over" and reward == 0.0 and info["steps_used"] == 1
    obs, *_ = submit(env)
    assert obs["error"]["code"] == "episode_over" and len(env.evaluator_log) == 1  # no re-scoring


def test_malformed_submission_is_minus_one():
    for bad in ({"findings": "nope"}, {"findings": {"episode_id": "wrong", "findings": []}},
                {"findings": {"findings": [{"type": "x"}]}}):
        env, *_ = env_on()
        obs, reward, term, trunc, _ = env.step({"action": "submit", **bad})
        assert term and reward == -1.0 and obs["error"]["code"] == "invalid_submission"
        assert env.evaluator_log[-1]["malformed"]


def test_submission_limits():
    env, *_ = env_on()
    f = {"type": "duplicate_invoice", "affected_ids": ["A"], "claimed_amount_minor": 1, "currency": "KZT",
         "evidence_ids": [], "explanation": "x"}
    for findings in ([f] * 31, [{**f, "evidence_ids": ["e"] * 11}], [{**f, "explanation": "x" * 1001}],
                     [{**f, "claimed_amount_minor": -5}], [{**f, "claimed_amount_minor": 1.5}], [{**f, "affected_ids": []}]):
        env.reset(episode_dir=FIXTURES / "duplicate")
        _, reward, term, *_ = submit(env, findings)
        assert term and reward == -1.0
    env.reset(episode_dir=FIXTURES / "duplicate")
    _, reward, *_ = submit(env, [{**f, "extra_key": 1}] * 30)  # extra keys ignored, 30 is allowed
    assert reward == 0.5


def test_step_limit_truncates_with_empty_findings():
    seen = []
    env, *_ = env_on(scorer=lambda d, p, s: seen.append((p, s)) or {"reward": -0.7})
    for n in range(99):
        obs, reward, term, trunc, _ = env.step({"action": "calculator", "expression": "1+1"})
        assert not trunc
    obs, reward, term, trunc, _ = env.step({"action": "calculator", "expression": "1+1"})
    assert trunc and not term and obs["steps_remaining"] == 0 and reward == -0.7
    assert seen == [({"episode_id": env.episode_id, "findings": []}, 100)]
    obs, *_ = env.step({"action": "calculator", "expression": "1+1"})
    assert obs["error"]["code"] == "episode_over"


def test_submit_on_step_100_is_allowed():
    env, *_ = env_on()
    for _ in range(99):
        env.step({"action": "calculator", "expression": "1"})
    obs, reward, term, trunc, _ = submit(env)
    assert term and not trunc and obs["result"]["inspection_steps"] == 99


def test_time_limit_truncates():
    t = [0.0]
    env = AuditEnv(scorer=fake_scorer, clock=lambda: t[0])
    env.reset(episode_dir=FIXTURES / "clean")
    env.step({"action": "calculator", "expression": "1"})
    t[0] = 61.0
    obs, reward, term, trunc, _ = env.step({"action": "calculator", "expression": "1"})
    assert trunc and not term and reward == 0.25 and env.evaluator_log[-1]["truncated_reason"] == "time limit exceeded"


def test_closed_mode_hides_reward():
    env = AuditEnv(config=load_config(env={"mode": "closed"}), scorer=fake_scorer)
    obs, info = env.reset(episode_dir=FIXTURES / "duplicate")
    assert info["mode"] == "closed"
    _, reward, term, *_ = submit(env, [])
    assert term and reward == 0.0 and env.evaluator_log[-1]["reward"] == 0.25
    env.reset(episode_dir=FIXTURES / "duplicate")
    _, reward, *_ = env.step({"action": "submit", "findings": "bad"})
    assert reward == 0.0 and env.evaluator_log[-1]["reward"] == -1.0


def test_reset_isolates_state():
    env, *_ = env_on()
    for _ in range(10):
        env.step({"action": "list_records", "table": "ledger"})
    obs, info = env.reset(episode_dir=FIXTURES / "allocation")
    assert obs["steps_used"] == 0 and info["episode_id"] != load_private(FIXTURES / "duplicate")["truth"]["episode_id"]


def test_generated_episode_and_determinism(tmp_path):
    actions = [{"action": "list_records", "table": "invoices", "limit": 50},
               {"action": "list_records", "table": "ledger", "limit": 13},
               {"action": "calculator", "expression": "552.10 * 1000"}]

    def play():
        env = AuditEnv(scorer=fake_scorer, workdir=tmp_path)
        out = [env.reset(seed=1001)]
        out += [env.step(a) for a in actions]
        out.append(submit(env))
        return json.dumps(out, sort_keys=True)

    assert play() == play()


def test_no_truth_or_paths_in_observations(tmp_path):
    env = AuditEnv(scorer=fake_scorer, workdir=tmp_path)
    obs, info = env.reset(seed=1002)
    truth = load_private(env.episode_dir)
    text = [json.dumps([obs, info])]
    for table in ("ledger", "invoices", "payments", "fx"):
        cursor = None
        while True:
            o, *rest = env.step({"action": "list_records", "table": table, "cursor": cursor})
            text.append(json.dumps([o, rest]))
            cursor = o["result"]["next_cursor"]
            if cursor is None or o["steps_remaining"] < 5:
                break
    blob = "".join(text)
    for token in ["ISS-", "evidence_sets", "expected_amount", "provenance", "private", str(env.episode_dir),
                  '"seed"', "clerk", "distractor"] + [c["decision"] for c in truth["provenance"]["changes"]]:
        assert token not in blob, token
