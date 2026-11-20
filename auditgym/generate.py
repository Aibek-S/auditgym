"""seed + config -> episode folder (clean history in #2; error injection is added in #3). Owner: Aibek."""

from __future__ import annotations

import json
from pathlib import Path

from auditgym.history import build_history
from auditgym.ledger import build_ledger
from auditgym.render import render

DEFAULT_CONFIG = Path(__file__).resolve().parent.parent / "configs" / "default.json"


def load_config(path: str | Path | None = None, **overrides) -> dict:
    config = json.loads(Path(path or DEFAULT_CONFIG).read_text(encoding="utf-8"))
    config.update(overrides)
    return config


def generate(seed: int, config: dict, out: str | Path) -> dict:
    history = build_history(seed, config)
    events = build_ledger(history)
    return render(history, events, Path(out))
