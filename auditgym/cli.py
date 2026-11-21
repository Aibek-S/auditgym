"""Command line entry point: python -m auditgym <command>. Owner: Meirbek (#5, #6)."""

import argparse
import sys

from auditgym import DECISIONS_VERSION, GENERATOR_VERSION, SCHEMA_VERSION


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m auditgym",
        description="AuditGym: synthetic audit episodes, RL environment and evaluator.",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"auditgym {GENERATOR_VERSION} (schema {SCHEMA_VERSION}, {DECISIONS_VERSION})",
    )
    sub = parser.add_subparsers(dest="command", metavar="command")

    gen = sub.add_parser("generate", help="generate one episode from a seed")
    gen.add_argument("--seed", type=int, required=True)
    gen.add_argument("--config", default="configs/default.json")
    gen.add_argument("--out", required=True)

    run = sub.add_parser("run", help="run a policy on seeds and write trajectories + metrics")
    run.add_argument("--policy", required=True, choices=["random", "flag_all", "reconcile", "explorer", "oracle"])
    run.add_argument("--seeds", required=True, help="e.g. 1001-1010 or 3,5,7")
    run.add_argument("--mode", choices=["open", "closed"], default="open")
    run.add_argument("--out", default="runs")

    chk = sub.add_parser("check", help="full offline check: reproduce episodes, verify truth, tests, baselines")
    chk.add_argument("--out", default="results")
    chk.add_argument("--skip-tests", action="store_true")
    sub.add_parser("build-episodes", help="regenerate the published train/dev episodes in episodes/")

    srv = sub.add_parser("serve", help="local JSON/SSE bridge for the web console (demo only)")
    srv.add_argument("--port", type=int, default=8765)
    srv.add_argument("--host", default="127.0.0.1")
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    if args.command is None:
        build_parser().print_help()
        return 0
    if args.command == "check":
        from auditgym.check import main as check_main

        return check_main(args.out, args.skip_tests)
    if args.command == "build-episodes":
        from auditgym.check import build_episodes

        build_episodes()
        print("episodes/train (seeds 1001-1010) and episodes/dev (seeds 2001-2010) written")
        return 0
    if args.command == "serve":
        from auditgym.serve import serve

        serve(args.port, args.host)
        return 0
    if args.command == "run":
        import json
        from pathlib import Path

        from auditgym.generate import load_config
        from auditgym.runner import run_episode

        seeds = []
        for part in args.seeds.split(","):
            lo, _, hi = part.partition("-")
            seeds += list(range(int(lo), int(hi or lo) + 1))
        out = Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        config = load_config(env={"mode": args.mode})
        with open(out / f"trajectories-{args.policy}.jsonl", "w", encoding="utf-8") as traj, \
                open(out / f"evaluator-{args.policy}.jsonl", "w", encoding="utf-8") as evlog:
            rewards = []
            for seed in seeds:
                rec = run_episode(args.policy, seed=seed, config=config, trajectory=traj, policy_seed=seed)
                evlog.write(json.dumps(rec) + "\n")
                rewards.append(rec["reward"])
                print(f"seed {seed}: reward {rec['reward']:+.3f} f1 {rec.get('f1', 0):.3f} steps {rec['steps']}")
        print(f"{args.policy}: mean reward {sum(rewards) / len(rewards):+.3f} over {len(seeds)} episodes -> {out}")
        return 0
    if args.command == "generate":
        from auditgym.generate import generate, load_config

        info = generate(args.seed, load_config(args.config), args.out)
        print(f"episode {info['episode_id']} written to {args.out}")
        return 0
    return 2
