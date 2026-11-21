"""`python -m auditgym check`: the single offline check command (D-91).

1. Regenerate the published train/dev episodes and verify they are byte-identical to `episodes/`.
2. Verify every episode independently: accounting invariants on public files == truth, every evidence
   set reproduces its amount (`invariants.verify_episode`).
3. Run the test suite (pytest).
4. Run the four baselines on train + dev, write trajectories, evaluator logs and the metrics table.
Exit code 0 only if every step passes.
"""

from __future__ import annotations

import filecmp
import json
import platform
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from auditgym import DECISIONS_VERSION, GENERATOR_VERSION, SCHEMA_VERSION
from auditgym.episode import PRIVATE_FILES, PUBLIC_FILES, load_private, load_public
from auditgym.generate import generate, load_config
from auditgym.invariants import verify_episode

ROOT = Path(__file__).resolve().parent.parent
SPLITS = {"train": range(1001, 1011), "dev": range(2001, 2011)}
POLICIES = ("random", "reconcile", "flag_all", "oracle")


def episode_dirs(root: Path = ROOT / "episodes"):
    for split, seeds in SPLITS.items():
        for seed in seeds:
            yield split, seed, root / split / f"seed-{seed}"


def plan_candidates(index: int, seed: int) -> list[list[str]]:
    """Fixed split composition (D-82): 3 clean, 3 interacting, 4 with 1-6 single errors per split.

    Mirrors the hidden evaluation mix (5 clean + 5 interacting out of 20). I1 needs a Mon-Thu month end,
    so every interacting slot falls back to I2. The chosen plan is stored in private/seed_config.json.
    """
    import random

    types = ["duplicate_invoice", "payment_allocation", "fx_conversion", "period_cutoff"]
    r = random.Random(f"split:{seed}")
    if index < 3:
        return [[]]
    if index < 6:
        extra = [r.choice(types) for _ in range(index - 3)]
        first = "I1" if index != 4 else "I2"
        return [[first] + extra, ["I2"] + extra, ["I2"]]
    singles = [r.choice(types) for _ in range(r.randint(1, 6))]
    return [singles, singles[:3], singles[:1]]


def build_episodes(root: Path = ROOT / "episodes") -> None:
    from auditgym.generate import GenerationError

    for split, seeds in SPLITS.items():
        for index, seed in enumerate(seeds):
            path = root / split / f"seed-{seed}"
            for plan in plan_candidates(index, seed):
                try:
                    generate(seed, load_config(errors={"plan": plan}), path)
                    break
                except GenerationError:
                    continue
            else:
                raise RuntimeError(f"no plan could be placed for {split} seed {seed}")


def _same_tree(a: Path, b: Path) -> list[str]:
    diffs = []
    for sub, names in (("public", PUBLIC_FILES), ("private", PRIVATE_FILES)):
        _, mismatch, errors = filecmp.cmpfiles(a / sub, b / sub, list(names), shallow=False)
        diffs += [f"{sub}/{n}" for n in mismatch + errors]
    return diffs


def step_reproduce(log) -> bool:
    with tempfile.TemporaryDirectory() as tmp:
        build_episodes(Path(tmp))
        bad = []
        for split, seed, path in episode_dirs():
            fresh = Path(tmp) / split / f"seed-{seed}"
            if not path.exists():
                bad.append(f"{path.name}: missing (run `python -m auditgym build-episodes`)")
                continue
            bad += [f"{split}/seed-{seed}/{d}" for d in _same_tree(path, fresh)]
    log(f"published episodes reproduce byte-for-byte from seeds: {'OK' if not bad else 'FAIL ' + str(bad[:5])}")
    return not bad


def step_verify(log) -> bool:
    from auditgym.invariants import check

    bad, issues, clean, interacting = [], 0, 0, 0
    for split, seed, path in episode_dirs():
        priv = load_private(path)
        problems = verify_episode(load_public(path), priv["truth"])
        # Accounting equalities BEFORE injection: the same seed and config without errors must be clean.
        twin_config = dict(priv["seed_config"]["config"])
        twin_config["errors"] = {**twin_config["errors"], "plan": []}
        with tempfile.TemporaryDirectory() as tmp:
            generate(seed, twin_config, tmp)
            if check(load_public(Path(tmp))):
                problems.append("clean twin (before injection) violates invariants")
        if problems:
            bad.append((split, seed, problems[:2]))
        n = len(priv["truth"]["issues"])
        issues += n
        clean += n == 0
        interacting += any(c.get("scenario") for c in priv["provenance"]["changes"])
    log(f"before injection: books balance and invariants hold; after: violations == truth, evidence proves "
        f"every amount. 20 episodes ({issues} issues, {clean} clean, {interacting} interacting): "
        f"{'OK' if not bad else 'FAIL ' + str(bad[:3])}")
    return not bad


def step_tests(log) -> bool:
    result = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", str(ROOT / "tests")],
                            cwd=ROOT, capture_output=True, text=True)
    tail = (result.stdout.strip().splitlines() or ["no output"])[-1]
    log(f"tests: {tail}")
    return result.returncode == 0


def step_baselines(log, out: Path) -> bool:
    from auditgym.runner import run_episode

    out.mkdir(parents=True, exist_ok=True)
    rows, ok = [], True
    records = {}
    for policy in POLICIES:
        with open(out / f"trajectories-{policy}.jsonl", "w", encoding="utf-8") as traj, \
                open(out / f"evaluator-{policy}.jsonl", "w", encoding="utf-8") as evlog:
            recs = []
            for split, seed, path in episode_dirs():
                rec = run_episode(policy, episode_dir=path, trajectory=traj, policy_seed=seed)
                rec["split"], rec["seed"] = split, seed
                evlog.write(json.dumps(rec) + "\n")
                recs.append(rec)
        records[policy] = recs
        for split in ("train", "dev", "all"):
            sub = [r for r in recs if split == "all" or r["split"] == split]
            rows.append({
                "policy": policy, "split": split, "episodes": len(sub),
                "precision": statistics.mean(r["precision"] for r in sub),
                "recall": statistics.mean(r["recall"] for r in sub),
                "f1": statistics.mean(r["f1"] for r in sub),
                "return": statistics.mean(r["reward"] for r in sub),
                "steps": statistics.mean(r["steps"] for r in sub),
                "inspection_steps": statistics.mean(r["inspection_steps"] for r in sub),
                "time_s": statistics.mean(r["time_s"] for r in sub),
                "tp": sum(r["tp"] for r in sub), "fp": sum(r["fp"] for r in sub), "fn": sum(r["fn"] for r in sub),
            })
            row = rows[-1]
            row["micro_precision"] = row["tp"] / (row["tp"] + row["fp"]) if row["tp"] + row["fp"] else 0.0
            row["micro_recall"] = row["tp"] / (row["tp"] + row["fn"]) if row["tp"] + row["fn"] else 0.0
    with open(out / "trajectories.jsonl", "w", encoding="utf-8") as combined:
        for policy in POLICIES:
            combined.write((out / f"trajectories-{policy}.jsonl").read_text(encoding="utf-8"))
    mean = {p: statistics.mean(r["reward"] for r in records[p]) for p in POLICIES}
    checks = {
        "oracle reaches the maximum on every episode": all(r["reward"] == 1.0 for r in records["oracle"]),
        "flag_all is below silence": mean["flag_all"] < -0.5,
        "random is below reconcile": mean["random"] < mean["reconcile"],
        "no episode exceeded 60 s": all(r["time_s"] < 60 for p in POLICIES for r in records[p]),
    }
    for name, passed in checks.items():
        log(f"baseline sanity: {name}: {'OK' if passed else 'FAIL'}")
        ok &= passed
    table = ["| policy | split | n | P (all findings) | R (all issues) | mean F1 | mean return | mean inspection steps | "
             "mean time s | TP/FP/FN |", "|---|---|---|---|---|---|---|---|---|---|"]  # steps = inspection steps (submit excluded)
    for r in rows:
        table.append(f"| {r['policy']} | {r['split']} | {r['episodes']} | {r['micro_precision']:.3f} | "
                     f"{r['micro_recall']:.3f} | {r['f1']:.3f} | {r['return']:+.3f} | {r['inspection_steps']:.1f} | "
                     f"{r['time_s']:.3f} | {r['tp']}/{r['fp']}/{r['fn']} |")
    table.append("")
    table.append("Per-episode P and R follow the brief (0 on a zero denominator, so a correct empty answer on a "
                 "clean episode has P = R = 0 and F1 = 1); the table shows P and R over all findings and issues.")
    (out / "metrics.md").write_text("\n".join(table) + "\n", encoding="utf-8")
    (out / "metrics.json").write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
    log("\n" + "\n".join(table))
    return ok


def main(out: str | Path = "results", skip_tests: bool = False) -> int:
    started = time.monotonic()
    out = Path(out)
    lines: list[str] = []

    def log(msg: str) -> None:
        print(msg, flush=True)
        lines.append(msg)

    log(f"AuditGym check | generator {GENERATOR_VERSION} | schema {SCHEMA_VERSION} | {DECISIONS_VERSION} | "
        f"config default v{load_config()['config_version']} | Python {platform.python_version()}")
    steps = [("reproduce", step_reproduce), ("verify", step_verify)]
    if not skip_tests:
        steps.append(("tests", step_tests))
    results = {name: fn(log) for name, fn in steps}
    results["baselines"] = step_baselines(log, out)
    passed = all(results.values())
    log(f"\nRESULT: {'PASS' if passed else 'FAIL'} {results} in {time.monotonic() - started:.1f} s; outputs in {out}/")
    out.mkdir(parents=True, exist_ok=True)
    (out / "check.log").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 0 if passed else 1
