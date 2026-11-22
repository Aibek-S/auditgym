"""Evaluator: normalization, one-to-one matching, P/R/F1 and the official reward (DECISIONS section 10).

Published rules (the brief requires them to be public):

- Normalization (D-62): type lowercased, trimmed, spaces and '-' -> '_', then the alias table below;
  ids trimmed, doc_id <-> invoice_id/payment_id mapped both ways, duplicates removed; currency uppercased.
  An unknown type is not malformed, it can only be a false positive; nor is a negative amount or an
  affected_ids list that is empty or longer than 10 (D-61a).
- Candidate pair (D-63): same type, same affected_ids set, same currency, |claimed - expected| <= tolerance
  (policy.amount_tolerance_minor, 100 minor units), and evidence_ids contain at least one full acceptable set.
- Assignment (D-64): maximum bipartite matching, deterministic (findings in submission order, issues in
  sorted order, augmenting paths). TP = matched, FP = findings - TP, FN = issues - TP. Repeats are FP.
- Metrics (D-65): P = TP/(TP+FP), R = TP/(TP+FN), F1 = 2TP/(2TP+FP+FN); 0 on a zero denominator;
  empty truth and empty findings -> F1 = 1; empty truth with findings -> F1 = 0.
- Reward (D-66): clip(2*F1 - 1 - 0.002*inspection_steps, -1, 1). Malformed -> -1.
- `explanation` never affects the score (D-67).
"""

from __future__ import annotations

from pathlib import Path

from auditgym.episode import load_private, load_public
from auditgym.submission import validate

TYPES = ("duplicate_invoice", "payment_allocation", "fx_conversion", "period_cutoff")
ALIASES = {
    "duplicate": "duplicate_invoice", "duplicate_invoices": "duplicate_invoice", "double_invoice": "duplicate_invoice",
    "partial_payment": "payment_allocation", "missing_allocation": "payment_allocation",
    "payment_misallocation": "payment_allocation", "allocation": "payment_allocation",
    "unallocated_payment": "payment_allocation",
    "fx": "fx_conversion", "fx_rate_error": "fx_conversion", "fx_error": "fx_conversion",
    "wrong_fx_rate": "fx_conversion", "currency_conversion": "fx_conversion",
    "cutoff": "period_cutoff", "period_cutoff_error": "period_cutoff", "cut_off": "period_cutoff",
    "wrong_period": "period_cutoff",
}
STEP_COST = 0.002


def normalize_type(value: str) -> str:
    t = value.strip().lower().replace(" ", "_").replace("-", "_")
    return ALIASES.get(t, t)


class IdMap:
    """doc_id <-> business id, built from the public documents."""

    def __init__(self, pub: dict):
        self.to_business: dict[str, str] = {}
        for inv in pub["invoices"]:
            self.to_business[inv["doc_id"]] = inv["invoice_id"]
        for pay in pub["payments"]:
            self.to_business[pay["doc_id"]] = pay["payment_id"]
        self.to_doc = {v: k for k, v in self.to_business.items()}

    def business(self, x: str) -> str:
        x = x.strip()
        return self.to_business.get(x, x)

    def evidence(self, x: str) -> set[str]:
        """Every form of an evidence id (doc and business form are interchangeable)."""
        x = x.strip()
        forms = {x}
        if x in self.to_business:
            forms.add(self.to_business[x])
        if x in self.to_doc:
            forms.add(self.to_doc[x])
        return forms


MAX_AFFECTED_IDS = 10


def _candidate(finding: dict, issue: dict, ids: IdMap, tolerance: int) -> bool:
    # A negative amount or an empty / oversized affected_ids list is a well-formed but wrong finding:
    # it can only be a false positive; the rest of the answer is still scored (D-61a).
    if finding["claimed_amount_minor"] < 0 or not 1 <= len(finding["affected_ids"]) <= MAX_AFFECTED_IDS:
        return False
    if normalize_type(finding["type"]) != issue["type"]:
        return False
    if finding["currency"].strip().upper() != issue["currency"]:
        return False
    if {ids.business(x) for x in finding["affected_ids"]} != {ids.business(x) for x in issue["affected_ids"]}:
        return False
    if abs(finding["claimed_amount_minor"] - issue["expected_amount_minor"]) > tolerance:
        return False
    given = set()
    for x in finding["evidence_ids"]:
        given |= ids.evidence(x)
    return any(all(ids.evidence(e) & given for e in group) for group in issue["evidence_sets"])


def match(findings: list[dict], issues: list[dict], ids: IdMap, tolerance: int) -> dict[int, int]:
    """Maximum bipartite matching finding index -> issue index (Kuhn's algorithm, deterministic order)."""
    order = sorted(range(len(issues)), key=lambda i: issues[i]["issue_id"])
    edges = [[i for i in order if _candidate(f, issues[i], ids, tolerance)] for f in findings]
    owner: dict[int, int] = {}  # issue -> finding

    def augment(f: int, seen: set[int]) -> bool:
        for i in edges[f]:
            if i in seen:
                continue
            seen.add(i)
            if i not in owner or augment(owner[i], seen):
                owner[i] = f
                return True
        return False

    for f in range(len(findings)):
        augment(f, set())
    return {f: i for i, f in owner.items()}


def metrics(tp: int, fp: int, fn: int) -> dict:
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    if tp + fp + fn == 0:
        f1 = 1.0  # empty truth and empty findings
    else:
        f1 = 2 * tp / (2 * tp + fp + fn)
    return {"tp": tp, "fp": fp, "fn": fn, "precision": precision, "recall": recall, "f1": f1}


def reward(f1: float, inspection_steps: int) -> float:
    return max(-1.0, min(1.0, 2 * f1 - 1 - STEP_COST * inspection_steps))


def score(payload, truth: dict, pub: dict, inspection_steps: int, limits: dict | None = None) -> dict:
    """Score one submission. Returns metrics, reward and per-finding diagnostics (evaluator side only)."""
    reason = validate(payload, truth["episode_id"], limits)
    if reason is not None:
        return {"reward": -1.0, "malformed": True, "reason": reason, "inspection_steps": inspection_steps,
                "tp": 0, "fp": 0, "fn": len(truth["issues"]), "precision": 0.0, "recall": 0.0, "f1": 0.0}
    issues = truth["issues"]
    findings = payload["findings"]
    ids = IdMap(pub)
    tolerance = int(pub["policy"].get("amount_tolerance_minor", 100))
    pairs = match(findings, issues, ids, tolerance)
    m = metrics(len(pairs), len(findings) - len(pairs), len(issues) - len(pairs))
    per_type = {}
    for t in TYPES:
        t_issues = [i for i in issues if i["type"] == t]
        t_findings = [n for n, f in enumerate(findings) if normalize_type(f["type"]) == t]
        t_tp = sum(1 for n in t_findings if n in pairs)
        if t_issues or t_findings:
            per_type[t] = metrics(t_tp, len(t_findings) - t_tp, len(t_issues) - t_tp)
    return {
        **m,
        "reward": reward(m["f1"], inspection_steps),
        "inspection_steps": inspection_steps,
        "malformed": False,
        "matched": {str(f): issues[i]["issue_id"] for f, i in sorted(pairs.items())},
        "per_type": per_type,
    }


def score_episode(episode_dir: str | Path, payload, inspection_steps: int) -> dict:
    """Scorer hook for AuditEnv: reads private truth on the evaluator side."""
    episode_dir = Path(episode_dir)
    return score(payload, load_private(episode_dir)["truth"], load_public(episode_dir), inspection_steps)
