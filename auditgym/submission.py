"""Structural validation of `submit` payloads (D-60, D-61). Shared by env (#4) and matcher (#5).

Only the shape is checked here; matching against truth happens on the evaluator side.
"""

from __future__ import annotations

FINDING_FIELDS = {
    "type": str,
    "affected_ids": list,
    "claimed_amount_minor": int,
    "currency": str,
    "evidence_ids": list,
    "explanation": str,
}
DEFAULT_LIMITS = {"max_findings": 30, "max_evidence_ids": 10, "max_affected_ids": 10, "max_explanation_chars": 1000}


def coerce(action: dict):
    """Accept `{"findings": {episode_id, findings}}` or `{"episode_id", "findings": [...]}`."""
    findings = action.get("findings")
    if isinstance(findings, dict):
        return findings
    if isinstance(findings, list):
        return {"episode_id": action.get("episode_id"), "findings": findings}
    return findings


def validate(payload, episode_id: str, limits: dict | None = None) -> str | None:
    """Return None if valid, else a short reason (for the evaluator log; never contains truth)."""
    lim = {**DEFAULT_LIMITS, **(limits or {})}
    if not isinstance(payload, dict):
        return "submission must be an object"
    if payload.get("episode_id") != episode_id:
        return "episode_id missing or wrong"
    findings = payload.get("findings")
    if not isinstance(findings, list):
        return "findings must be a list"
    if len(findings) > lim["max_findings"]:
        return f"more than {lim['max_findings']} findings"
    for n, f in enumerate(findings):
        if not isinstance(f, dict):
            return f"finding {n} is not an object"
        for name, kind in FINDING_FIELDS.items():
            value = f.get(name)
            if kind is int:
                if type(value) is not int or value < 0:
                    return f"finding {n}: {name} must be a non-negative integer"
            elif not isinstance(value, kind):
                return f"finding {n}: {name} must be {kind.__name__}"
        if not 1 <= len(f["affected_ids"]) <= lim["max_affected_ids"]:
            return f"finding {n}: affected_ids must have 1-{lim['max_affected_ids']} ids"
        if len(f["evidence_ids"]) > lim["max_evidence_ids"]:
            return f"finding {n}: more than {lim['max_evidence_ids']} evidence_ids"
        if not all(isinstance(x, str) for x in f["affected_ids"] + f["evidence_ids"]):
            return f"finding {n}: ids must be strings"
        if len(f["explanation"]) > lim["max_explanation_chars"]:
            return f"finding {n}: explanation longer than {lim['max_explanation_chars']} characters"
    return None
