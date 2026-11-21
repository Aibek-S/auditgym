"""Baselines, runner and trajectories (issue #5): ordering of rewards, subprocess protocol, no leaks."""

from __future__ import annotations

import io
import json
import statistics

import pytest

from auditgym.episode import load_private
from auditgym.generate import generate, load_config
from auditgym.runner import run_episode

SEEDS = range(1001, 1013)


@pytest.fixture(scope="module")
def results():
    out = {}
    for policy in ("random", "flag_all", "reconcile", "oracle"):
        out[policy] = [run_episode(policy, seed=s, policy_seed=s, in_process=True) for s in SEEDS]
    return out


def mean(records):
    return statistics.mean(r["reward"] for r in records)


def test_reward_ordering(results):
    assert all(r["reward"] == 1.0 for r in results["oracle"])
    assert mean(results["flag_all"]) < -0.6
    assert mean(results["random"]) < 0
    assert mean(results["reconcile"]) > 0.5
    assert mean(results["oracle"]) > mean(results["reconcile"]) > mean(results["random"])


def test_flag_all_loses_to_silence_on_clean():
    cfg = load_config(errors={"plan": []})
    flag = run_episode("flag_all", seed=1001, config=cfg, in_process=True)
    oracle = run_episode("oracle", seed=1001, config=cfg)  # empty submission
    assert oracle["reward"] == 1.0 and flag["reward"] == -1.0


def test_subprocess_matches_in_process():
    a = run_episode("reconcile", seed=1004)
    b = run_episode("reconcile", seed=1004, in_process=True)
    assert {k: a[k] for k in ("reward", "tp", "fp", "fn", "steps")} == {k: b[k] for k in ("reward", "tp", "fp", "fn", "steps")}


def test_trajectory_format_and_replay():
    buf1, buf2 = io.StringIO(), io.StringIO()
    run_episode("random", seed=1005, policy_seed=3, trajectory=buf1, in_process=True)
    run_episode("random", seed=1005, policy_seed=3, trajectory=buf2, in_process=True)
    assert buf1.getvalue() == buf2.getvalue()
    lines = [json.loads(x) for x in buf1.getvalue().splitlines()]
    assert lines[0]["step"] == 0 and lines[0]["action"] is None
    assert [x["step"] for x in lines] == list(range(len(lines)))
    for x in lines:
        assert set(x) == {"episode_id", "step", "action", "observation", "reward", "terminated", "truncated", "policy"}
    assert lines[-1]["terminated"] or lines[-1]["truncated"]


def test_closed_mode_trajectory_hides_reward():
    buf = io.StringIO()
    rec = run_episode("oracle", seed=1006, config=load_config(env={"mode": "closed"}), trajectory=buf)
    lines = [json.loads(x) for x in buf.getvalue().splitlines()]
    assert rec["reward"] == 1.0 and all(x["reward"] == 0.0 for x in lines)


def test_trajectories_do_not_leak_truth(tmp_path):
    for seed in (1007, 1008):
        buf = io.StringIO()
        run_episode("reconcile", seed=seed, trajectory=buf, in_process=True)
        generate(seed, load_config(), tmp_path / str(seed))
        private = load_private(tmp_path / str(seed))
        text = buf.getvalue()
        for token in ["ISS-", "evidence_sets", "expected_amount", "provenance", '"seed"', "clerk", "distractor"]:
            assert token not in text, token
        for change in private["provenance"]["changes"]:
            assert change["decision"] not in text


def test_paired_transform_keeps_oracle_reward():
    base = run_episode("oracle", seed=1009)
    paired = run_episode("oracle", seed=1009, config=load_config(id_salt="pair-7", order_mode="shuffled"))
    assert base["reward"] == paired["reward"] == 1.0
    assert base["episode_id"] != paired["episode_id"]
