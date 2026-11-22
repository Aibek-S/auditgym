"""Fixes after the jury review: secret seeds, sealed private files, soft invalid findings, no pair shortcut."""

from __future__ import annotations

import collections
import json
from pathlib import Path

from auditgym import rng
from auditgym.env import AuditEnv
from auditgym.episode import load_private, load_public
from auditgym.generate import generate, load_config
from auditgym.matcher import score, score_episode
from auditgym.policies.baselines import Oracle

FIXTURES = Path(__file__).parent / "fixtures"


def _eid(seed: int) -> str:
    r = rng.stream(seed, "episode")
    return "".join(r.choice("0123456789abcdef") for _ in range(16))


def test_secret_hides_the_seed_and_stays_reproducible(tmp_path, monkeypatch):
    seed = 4242
    generate(seed, load_config(secret=""), tmp_path / "open")
    generate(seed, load_config(secret="jury-key"), tmp_path / "a")
    generate(seed, load_config(secret="jury-key"), tmp_path / "b")
    open_id = load_public(tmp_path / "open")["manifest"]["episode_id"]
    hidden = load_public(tmp_path / "a")["manifest"]["episode_id"]
    assert open_id == _eid(seed)                        # without the secret the id follows the public seed
    assert hidden != open_id and all(_eid(s) != hidden for s in range(20000))   # a seed search finds nothing
    for name in ("public/ledger.csv", "public/invoices.jsonl", "private/truth.json"):
        assert (tmp_path / "a" / name).read_bytes() == (tmp_path / "b" / name).read_bytes()
    assert (tmp_path / "open/public/ledger.csv").read_bytes() != (tmp_path / "a/public/ledger.csv").read_bytes()
    seed_config = json.loads((tmp_path / "a/private/seed_config.json").read_text())
    assert seed_config["seed"] == seed and "jury-key" not in json.dumps(seed_config)
    monkeypatch.setenv("AUDITGYM_SECRET", "jury-key")   # the environment variable works the same way
    generate(seed, load_config(), tmp_path / "env")
    assert (tmp_path / "env/public/ledger.csv").read_bytes() == (tmp_path / "a/public/ledger.csv").read_bytes()


def test_generated_episode_keeps_no_answer_key_on_disk(tmp_path):
    env = AuditEnv(config=load_config(secret=""), scorer=score_episode, workdir=tmp_path)
    obs, info = env.reset(seed=1006)
    root = env.episode_dir
    assert (root / "public").is_dir() and not (root / "private").exists()
    assert not list(tmp_path.rglob("truth.json")) and not list(tmp_path.rglob("provenance.json"))
    truth = load_private(root)["truth"]               # the evaluator still has it, in memory
    _, reward, terminated, *_ = env.step(Oracle(truth).act(obs))
    assert terminated and reward == 1.0
    env.close()
    assert not root.exists()


def test_negative_amount_or_oversized_ids_is_one_false_finding():
    pub, truth = load_public(FIXTURES / "duplicate"), load_private(FIXTURES / "duplicate")["truth"]
    good = Oracle(truth).act({"result": {"manifest": {"episode_id": truth["episode_id"]}}})["findings"]["findings"]
    bad = {**good[0], "claimed_amount_minor": -good[0]["claimed_amount_minor"]}
    wide = {**good[0], "affected_ids": [f"INV-X{k}" for k in range(11)]}
    empty = {**good[0], "affected_ids": []}
    for extra in (bad, wide, empty):
        s = score({"episode_id": truth["episode_id"], "findings": good + [extra]}, truth, pub, 0)
        assert not s["malformed"] and (s["tp"], s["fp"]) == (len(good), 1)


def test_two_equal_invoices_of_one_customer_is_no_shortcut(tmp_path):
    tp = fp = 0
    for seed in range(300, 330):
        d = tmp_path / str(seed)
        generate(seed, load_config(secret=""), d)
        pub, truth = load_public(d), load_private(d)["truth"]
        dups = {frozenset(i["affected_ids"]) for i in truth["issues"] if i["type"] == "duplicate_invoice"}
        groups = collections.defaultdict(set)
        for inv in pub["invoices"]:
            groups[(inv["entity_id"], inv["total_minor"], inv["currency"])].add(inv["invoice_id"])
        pairs = {frozenset(v) for v in groups.values() if len(v) == 2}
        tp += len(pairs & dups)
        fp += len(pairs - dups)
    assert fp > 3 * max(tp, 1), (tp, fp)
