"""seed + config -> episode folder: clean history, injected errors, render, verification. Owner: Aibek.

Generation is accepted only if `invariants.verify_episode` passes: the invariant violations
found on the public files equal exactly the ones implied by truth.json, and every evidence set
reproduces its issue amount. Otherwise the error draw is retried (attempt k uses the stream
`errors:k`), so a seed always yields the same accepted episode.
"""

from __future__ import annotations

import copy
import hashlib
import json
import os
from pathlib import Path

from auditgym import rng
from auditgym.episode import load_private, load_public
from auditgym.errors import inject
from auditgym.history import build_history
from auditgym.invariants import verify_episode
from auditgym.ledger import build_ledger
from auditgym.render import render

DEFAULT_CONFIG = Path(__file__).resolve().parent.parent / "configs" / "default.json"
MAX_ATTEMPTS = 25


class GenerationError(RuntimeError):
    pass


def load_config(path: str | Path | None = None, **overrides) -> dict:
    config = json.loads(Path(path or DEFAULT_CONFIG).read_text(encoding="utf-8"))
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(config.get(key), dict):
            config[key] = {**config[key], **value}
        else:
            config[key] = value
    return config


def resolve_secret(config: dict) -> str:
    """The evaluator's secret (D-44): config["secret"], else $AUDITGYM_SECRET, else none.

    Published train/dev episodes use no secret (check forces ""), so anyone can rebuild them.
    Hidden evaluation sets AUDITGYM_SECRET: every RNG stream then depends on it, so neither the
    episode_id nor the records let an agent search seeds and rebuild the answer key with the public
    generator. Same secret + seed + config + version -> byte-identical episode.
    """
    secret = config.get("secret")
    if secret is None:
        secret = os.environ.get("AUDITGYM_SECRET", "")
    return str(secret)


def effective_seed(seed: int, secret: str) -> int:
    if not secret:
        return int(seed)
    return int.from_bytes(hashlib.sha256(f"auditgym-secret:{secret}:{seed}".encode()).digest()[:8], "big")


def generate(seed: int, config: dict, out: str | Path) -> dict:
    out = Path(out)
    secret = resolve_secret(config)
    config = {**config, "secret": "<set>" if secret else ""}   # the value itself is never written
    label, seed = seed, effective_seed(seed, secret)
    problems = []
    for attempt in range(MAX_ATTEMPTS):
        history = build_history(seed, copy.deepcopy(config))
        history.label_seed = label
        planned, plan = inject(history, config, rng.stream(seed, "errors", str(attempt)))
        if len(planned) < len(plan):
            problems.append(f"attempt {attempt}: placed {len(planned)} of {len(plan)}")
            continue
        events = build_ledger(history)
        info = render(history, events, out, planned=planned, plan=plan, attempt=attempt)
        problems = verify_episode(load_public(out), load_private(out)["truth"])
        if not problems:
            return info
    raise GenerationError(f"seed {seed}: no valid episode after {MAX_ATTEMPTS} attempts: {problems[:3]}")
