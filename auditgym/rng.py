"""Seeded RNG streams (D-40). Owner: Aibek.

Each concern (history, fx, ids, order, episode) gets its own `random.Random`, seeded with
sha256(f"{seed}:{stream}[:{salt}]"). Changing how ids are drawn therefore never changes
the business history, and `id_salt` (D-43) re-maps ids and order only.
"""

from __future__ import annotations

import hashlib
import random


def stream(seed: int, name: str, salt: str | None = None) -> random.Random:
    text = f"{seed}:{name}" if salt is None else f"{seed}:{name}:{salt}"
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    return random.Random(int.from_bytes(digest[:8], "big"))
