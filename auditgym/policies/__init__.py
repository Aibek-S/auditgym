"""Policies that talk to the environment only through observations and actions (D-80).

Baselines random, reconcile, flag_all and oracle come in issue #5. `registry()` maps a name to a
factory `f(session) -> policy`; a policy has `act(observation) -> action`.
"""

from __future__ import annotations


def registry() -> dict:
    from auditgym.policies.explorer import Explorer

    reg = {"explorer": lambda session: Explorer(seed=session.seed)}
    try:
        from auditgym.policies import baselines
    except ImportError:
        return reg
    reg.update(baselines.registry())
    return reg
