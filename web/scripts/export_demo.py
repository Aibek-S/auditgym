#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from auditgym.episode import load_private, load_public
from auditgym.generate import generate, load_config

WEB = ROOT / "web"
CACHE = WEB / ".demo-cache"
OUT = WEB / "public" / "data" / "demo.json"

ACCOUNTS = {
    "1010": "Bank KZT",
    "1020": "Bank USD",
    "1030": "Bank EUR",
    "1200": "Accounts receivable",
    "1900": "Unallocated receipts",
    "2000": "Accounts payable",
    "2100": "Customer advances",
    "3900": "Opening balance",
    "4000": "Revenue",
    "4100": "Sales returns",
    "5000": "Purchases / COGS",
    "7000": "FX gain / loss",
}

TYPE_LABEL = {
    "duplicate_invoice": "Duplicate invoice",
    "payment_allocation": "Missing allocation",
    "fx_conversion": "FX conversion",
    "period_cutoff": "Period cutoff",
}

TYPE_EXPLANATION = {
    "duplicate_invoice": "The same delivery is invoiced twice and both invoices reach revenue; no reversing credit note exists.",
    "payment_allocation": "The receipt is not fully applied to the invoice it names, so the invoice stays falsely open.",
    "fx_conversion": "The KZT booking does not follow the published FX rate date or rate.",
    "period_cutoff": "The document timestamp falls outside the period it is booked in.",
}

FIXTURES = [
    {"key": "duplicate", "label": "Duplicate invoice", "featured": True},
    {"key": "allocation", "label": "Missing allocation", "featured": False},
    {"key": "clean", "label": "Clean month", "featured": False},
]

GENERATED = [
    {"seed": 2003, "plan": ["I1"], "key": "i1", "label": "Interacting I1", "featured": True},
    {"seed": 2004, "plan": ["I2"], "key": "i2", "label": "Interacting I2", "featured": False},
    {"seed": 2001, "plan": ["period_cutoff"], "key": "cutoff", "label": "Period cutoff", "featured": False},
    {"seed": 2002, "plan": ["fx_conversion"], "key": "fx", "label": "FX conversion", "featured": False},
]


def demo_config(plan):
    config = load_config()
    config["size"] = {"customers": [8, 12], "invoices": [12, 18], "ledger_rows": [40, 80]}
    config["errors"].update(
        {"count": [1, 3], "clean_share": 0.0, "interacting_share": 0.0, "plan": plan}
    )
    config["order_mode"] = "chronological"
    return config


def ensure_generated():
    CACHE.mkdir(parents=True, exist_ok=True)
    for item in GENERATED:
        target = CACHE / f"seed-{item['seed']}"
        if (target / "public" / "manifest.json").exists():
            continue
        shutil.rmtree(target, ignore_errors=True)
        generate(item["seed"], demo_config(item["plan"]), target)


def trimmed_provenance(private):
    source = private.get("provenance") or {}
    changes = []
    for change in source.get("changes", []):
        changes.append(
            {
                "issue_id": change.get("issue_id"),
                "kind": change.get("kind"),
                "scenario": change.get("scenario"),
                "decision": change.get("decision"),
                "before": change.get("before"),
                "after": change.get("after"),
                "touched_ids": change.get("touched_ids", []),
            }
        )
    distractors = [d.get("kind") for d in source.get("distractors", [])]
    return {"plan": source.get("plan"), "changes": changes, "distractors": distractors}


def score(findings, issues, inspection_steps):
    tp = min(len(findings), len(issues))
    fp = max(0, len(findings) - tp)
    fn = max(0, len(issues) - tp)
    if tp == 0 and fp == 0 and fn == 0:
        precision = recall = f1 = 1.0
    elif tp == 0:
        precision = recall = f1 = 0.0
    else:
        precision = tp / (tp + fp)
        recall = tp / (tp + fn)
        f1 = 2 * precision * recall / (precision + recall)
    reward = max(-1.0, min(1.0, 2 * f1 - 1 - 0.002 * inspection_steps))
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "inspection_steps": inspection_steps,
        "reward": round(reward, 4),
    }


def make_step(number, action, label, kind, target, result, terminated=False, reward=0.0):
    return {
        "step": number,
        "action": action,
        "label": label,
        "kind": kind,
        "target": target,
        "observation": {
            "ok": True,
            "result": result,
            "error": None,
            "steps_used": number,
            "steps_remaining": max(0, 100 - number),
        },
        "reward": reward,
        "terminated": terminated,
        "truncated": False,
    }


def without_lines(invoice):
    return {key: value for key, value in invoice.items() if key != "line_items"}


def build_runs(public, issues):
    invoices = public["invoices"]
    payments = public["payments"]
    ledger = public["ledger"]
    fx_rows = public["fx"]

    invoice_by_id = {row["invoice_id"]: row for row in invoices}
    payment_by_id = {row["payment_id"]: row for row in payments}
    ledger_by_id = {row["row_id"]: row for row in ledger}
    fx_by_id = {
        f"{row['date']}:{row['source_currency']}:{row['target_currency']}": row for row in fx_rows
    }
    docs = {}
    for row in invoices:
        docs[row["doc_id"]] = ("invoice", row)
    for row in payments:
        docs[row["doc_id"]] = ("payment", row)

    steps = []
    seen = set()

    def add(action, label, kind, target, result):
        key = json.dumps(action, sort_keys=True)
        if key in seen:
            return
        seen.add(key)
        steps.append(
            make_step(len(steps) + 1, action, label, kind, target, result)
        )

    def list_step(table, limit=6, kind="list"):
        rows = ledger if table == "ledger" else invoices if table == "invoices" else payments
        if table == "invoices":
            rows = [without_lines(row) for row in rows]
        add(
            {"action": "list_records", "table": table, "cursor": None, "limit": limit},
            f"List {table}",
            kind,
            table,
            {"rows": rows[:limit], "next_cursor": f"{table}:{limit}"},
        )

    def record_step(table, record_id):
        if table == "ledger":
            result = ledger_by_id.get(record_id)
            label = f"Open ledger row {record_id}"
        elif table == "invoices":
            result = without_lines(invoice_by_id[record_id])
            label = f"Open invoice {record_id}"
        elif table == "payments":
            result = payment_by_id[record_id]
            label = f"Open payment {record_id}"
        elif table == "fx":
            result = fx_by_id.get(record_id)
            label = f"Open FX rate {record_id}"
        else:
            result = None
            label = f"Open {table} {record_id}"
        if result is not None:
            add(
                {"action": "get_record", "table": table, "id": record_id},
                label,
                "record",
                record_id,
                result,
            )

    def document_step(doc_id):
        entry = docs.get(doc_id)
        if not entry:
            return
        kind, record = entry
        add(
            {"action": "get_document", "doc_id": doc_id},
            f"Open {kind} document {doc_id}",
            "document",
            doc_id,
            record,
        )

    list_step("ledger")
    list_step("invoices")

    findings = []
    for issue in issues:
        for affected in issue["affected_ids"]:
            if affected in invoice_by_id:
                record_step("invoices", affected)
            elif affected in payment_by_id:
                record_step("payments", affected)

        evidence = (issue.get("evidence_sets") or [[]])[0]
        for item in evidence:
            if item in docs:
                document_step(item)
            elif item in ledger_by_id:
                record_step("ledger", item)
            elif item in fx_by_id:
                record_step("fx", item)

        findings.append(
            {
                "type": issue["type"],
                "affected_ids": issue["affected_ids"],
                "claimed_amount_minor": issue["expected_amount_minor"],
                "currency": issue["currency"],
                "evidence_ids": evidence,
                "explanation": TYPE_EXPLANATION.get(issue["type"], "Review the linked records."),
            }
        )

    if not issues:
        for row in ledger[:2]:
            record_step("ledger", row["row_id"])
        if invoices:
            document_step(invoices[0]["doc_id"])
        if payments:
            record_step("payments", payments[0]["payment_id"])

    inspection_steps = len(steps)
    submit = make_step(
        len(steps) + 1,
        {"action": "submit", "findings": findings},
        "Submit findings" if findings else "Submit clean opinion",
        "submit",
        f"{len(findings)} findings",
        {"submitted": len(findings)},
        terminated=True,
    )
    steps.append(submit)

    guided_score = score(findings, issues, inspection_steps)
    submit["reward"] = guided_score["reward"]

    oracle_score = score(
        [
            {
                "type": issue["type"],
                "affected_ids": issue["affected_ids"],
                "claimed_amount_minor": issue["expected_amount_minor"],
                "currency": issue["currency"],
                "evidence_ids": (issue.get("evidence_sets") or [[]])[0],
            }
            for issue in issues
        ],
        issues,
        0,
    )

    return [
        {
            "id": "oracle",
            "label": "Oracle",
            "kind": "oracle",
            "note": "Evaluator-side baseline. Reads hidden truth directly and uses 0 inspection steps.",
            "findings": [
                {
                    "type": issue["type"],
                    "affected_ids": issue["affected_ids"],
                    "claimed_amount_minor": issue["expected_amount_minor"],
                    "currency": issue["currency"],
                    "evidence_ids": (issue.get("evidence_sets") or [[]])[0],
                }
                for issue in issues
            ],
            "steps": [],
            "score": oracle_score,
        },
        {
            "id": "guided-review",
            "label": "Guided review",
            "kind": "replay",
            "note": "Demo replay: opens the real evidence from public files, then submits the recorded findings.",
            "findings": findings,
            "steps": steps,
            "score": guided_score,
        },
    ]


def build_episode(public, private, meta, source):
    issues = (private.get("truth") or {}).get("issues", [])
    manifest = public["manifest"]
    runs = build_runs(public, issues)
    guided = next(run for run in runs if run["id"] == "guided-review")
    type_counts = Counter(issue["type"] for issue in issues)
    return {
        "key": meta["key"],
        "label": meta["label"],
        "source": source,
        "seed": meta.get("seed"),
        "featured": meta.get("featured", False),
        "manifest": manifest,
        "accounts": ACCOUNTS,
        "policy": public["policy"],
        "ledger": public["ledger"],
        "invoices": public["invoices"],
        "payments": public["payments"],
        "fx": public["fx"],
        "truth": {
            "issues": issues,
            "provenance": trimmed_provenance(private),
        },
        "runs": runs,
        "summary": {
            "issue_types": [
                {"type": kind, "label": TYPE_LABEL.get(kind, kind), "count": count}
                for kind, count in sorted(type_counts.items())
            ],
            "issue_count": len(issues),
            "clean": not issues,
            "documents": manifest["counts"]["documents"],
            "guided_score": guided["score"],
        },
    }


def main():
    ensure_generated()
    episodes = []
    for meta in FIXTURES:
        root = ROOT / "tests" / "fixtures" / meta["key"]
        episodes.append(build_episode(load_public(root), load_private(root), meta, "fixture"))
    for meta in GENERATED:
        root = CACHE / f"seed-{meta['seed']}"
        episodes.append(build_episode(load_public(root), load_private(root), meta, "generated"))

    issue_counts = Counter()
    for episode in episodes:
        for issue in episode["truth"]["issues"]:
            issue_counts[issue["type"]] += 1
    guided_rewards = [e["summary"]["guided_score"]["reward"] for e in episodes]
    demo = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "company": {
            "name": "NorthAngels FoodService Ltd.",
            "model": "Wholesale and delivery to HoReCa and independent traders",
            "base_currency": "KZT",
        },
        "stats": {
            "episodes": len(episodes),
            "clean": sum(1 for e in episodes if e["summary"]["clean"]),
            "issues": sum(issue_counts.values()),
            "types": [
                {"type": kind, "label": TYPE_LABEL.get(kind, kind), "count": count}
                for kind, count in sorted(issue_counts.items())
            ],
            "documents": sum(e["manifest"]["counts"]["documents"] for e in episodes),
            "guided_reward_mean": round(sum(guided_rewards) / len(guided_rewards), 4),
        },
        "episodes": episodes,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(demo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size_mb = OUT.stat().st_size / (1024 * 1024)
    print(f"wrote {OUT.relative_to(ROOT)} ({size_mb:.2f} MB, {len(episodes)} episodes)")


if __name__ == "__main__":
    main()
