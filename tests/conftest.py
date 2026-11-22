"""Tests describe the published (secret-free) generator; an evaluator's AUDITGYM_SECRET must not leak in.

Removed at start-up, before module-scoped fixtures generate their episodes; a test that needs the
secret sets it with monkeypatch.
"""

import os


def pytest_configure(config):
    os.environ.pop("AUDITGYM_SECRET", None)
