"""Runner: policy in a separate process, JSON lines over stdin/stdout, trajectories (D-71, D-72, D-81).

The runner owns the environment and the evaluator. An agent policy runs as a subprocess
(`python -m auditgym.runner --agent <name> --seed <n>`), reads one observation per line and writes one
action per line. It gets no paths, files or object references. The oracle is evaluator-side and runs
in-process with the private truth (it exists only to check the maximum reward).

Trajectory line (D-81): episode_id, step, action, observation, reward, terminated, truncated, policy.
The reset is step 0 with action null. In closed mode the logged reward is the one the policy saw (0).
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

from auditgym.env import AuditEnv
from auditgym.episode import load_private
from auditgym.matcher import score_episode

AGENT_POLICIES = ("random", "flag_all", "reconcile", "explorer")
ALL_POLICIES = AGENT_POLICIES + ("oracle",)


def _make_agent(name: str, seed: int):
    from auditgym.policies.baselines import FlagAll, RandomExplorer, Reconcile
    from auditgym.policies.explorer import Explorer

    return {"random": lambda: RandomExplorer(seed), "flag_all": FlagAll, "reconcile": Reconcile,
            "explorer": lambda: Explorer(seed)}[name]()


def agent_main(name: str, seed: int) -> None:
    """Agent side of the protocol: observation in, action out, until the runner closes stdin."""
    policy = _make_agent(name, seed)
    for line in sys.stdin:
        observation = json.loads(line)
        sys.stdout.write(json.dumps(policy.act(observation)) + "\n")
        sys.stdout.flush()


class _Subprocess:
    def __init__(self, name: str, seed: int):
        self.proc = subprocess.Popen([sys.executable, "-m", "auditgym.runner", "--agent", name, "--seed", str(seed)],
                                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True,
                                     cwd=str(Path(__file__).resolve().parent.parent))

    def act(self, observation):
        self.proc.stdin.write(json.dumps(observation) + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        if not line:
            return {"action": "agent_crashed"}
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            return {"action": "invalid_json"}

    def close(self):
        if self.proc.stdin:
            self.proc.stdin.close()
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()


def run_episode(policy: str, *, seed: int | None = None, episode_dir=None, config: dict | None = None,
                trajectory=None, policy_seed: int = 0, in_process: bool = False) -> dict:
    """Play one episode. Returns the evaluator record (metrics, reward, steps, time)."""
    env = AuditEnv(config=config, scorer=score_episode)
    started = time.monotonic()
    obs, info = env.reset(seed=seed, episode_dir=episode_dir)

    def log(step, action, observation, reward, terminated, truncated):
        if trajectory is not None:
            trajectory.write(json.dumps({"episode_id": info["episode_id"], "step": step, "action": action,
                                         "observation": observation, "reward": reward, "terminated": terminated,
                                         "truncated": truncated, "policy": policy}, ensure_ascii=False) + "\n")

    log(0, None, obs, 0.0, False, False)
    if policy == "oracle":
        from auditgym.policies.baselines import Oracle

        agent = Oracle(load_private(env.episode_dir)["truth"])  # evaluator side only
    elif in_process:
        agent = _make_agent(policy, policy_seed)
    else:
        agent = _Subprocess(policy, policy_seed)
    try:
        while True:
            action = agent.act(obs)
            obs, reward, terminated, truncated, info = env.step(action)
            log(info["steps_used"], action, obs, reward, terminated, truncated)
            if terminated or truncated:
                break
    finally:
        if isinstance(agent, _Subprocess):
            agent.close()
    record = dict(env.evaluator_log[-1])
    record.update({"policy": policy, "seed": seed, "steps": info["steps_used"],
                   "time_s": round(time.monotonic() - started, 3)})
    record.pop("matched", None)
    return record


def main(argv=None) -> int:
    import argparse

    p = argparse.ArgumentParser(prog="python -m auditgym.runner")
    p.add_argument("--agent", choices=AGENT_POLICIES, required=True)
    p.add_argument("--seed", type=int, default=0)
    args = p.parse_args(argv)
    agent_main(args.agent, args.seed)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
