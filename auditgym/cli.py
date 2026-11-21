"""Command line entry point: python -m auditgym <command>. Owner: Meirbek (#5, #6)."""

import argparse
import sys

from auditgym import DECISIONS_VERSION, GENERATOR_VERSION, SCHEMA_VERSION

# command -> issue that implements it
_PENDING = {
    "run": "#5",
    "check": "#6",
}


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

    run = sub.add_parser("run", help="run a policy on episodes and write trajectories")
    run.add_argument("--policy", required=True)
    run.add_argument("--episodes", required=True)

    sub.add_parser("check", help="full offline check: generate, verify, test, baselines")

    srv = sub.add_parser("serve", help="local JSON/SSE bridge for the web console (demo only)")
    srv.add_argument("--port", type=int, default=8765)
    srv.add_argument("--host", default="127.0.0.1")
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    if args.command is None:
        build_parser().print_help()
        return 0
    if args.command == "serve":
        from auditgym.serve import serve

        serve(args.port, args.host)
        return 0
    if args.command == "generate":
        from auditgym.generate import generate, load_config

        info = generate(args.seed, load_config(args.config), args.out)
        print(f"episode {info['episode_id']} written to {args.out}")
        return 0
    print(f"'{args.command}' is not implemented yet (issue {_PENDING[args.command]}).", file=sys.stderr)
    return 2
