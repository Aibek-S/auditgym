"""Shared episode format: public policy text and a read-only loader for episode folders.

Shared by the data track (render, invariants) and the environment track (env, matcher).
Changing anything here changes the contract: needs a PR approved by both (CONTRIBUTING.md).
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

LEDGER_COLUMNS = [
    "row_id", "timestamp", "account", "debit_minor", "credit_minor",
    "currency", "entity_id", "invoice_id", "payment_id",
]
FX_COLUMNS = ["date", "source_currency", "target_currency", "rate"]
PUBLIC_FILES = ("manifest.json", "ledger.csv", "invoices.jsonl", "payments.jsonl", "fx.csv", "policy.json")
PRIVATE_FILES = ("truth.json", "provenance.json", "seed_config.json")
LEDGER_INT_COLUMNS = ("debit_minor", "credit_minor")

POLICY = {
    "period_basis": "invoice issued_at, local date (+05:00) = transfer of control",
    "fx_rate_date": "local date (+05:00) of the document timestamp",
    "fx_missing_rate": "last available rate before that date",
    "fx_conversion": "target_minor = round_half_up(source_minor * rate), once per document amount",
    "foreign_invoice_settlement": "AR relieved at carrying amount; difference to account 7000",
    "payment_allocation": (
        "payments in timestamp order; each payment is applied to its invoice_refs in the listed order, "
        "each invoice up to its open balance after credit notes issued before the payment; "
        "the remainder goes to 1900. Foreign invoices are relieved pro rata at their carrying KZT "
        "amount; the final settlement relieves the exact remainder"
    ),
    "unallocated_receipts_account": "1900",
    "amount_currency_for_findings": "KZT",
    "amount_tolerance_minor": 100,
}


def read_json(path: Path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line]


def read_csv(path: Path, int_columns=()) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        rows = []
        for row in csv.DictReader(f):
            row = {k: (v if v != "" else None) for k, v in row.items()}
            for col in int_columns:
                row[col] = int(row[col])
            rows.append(row)
        return rows


def load_public(root: Path) -> dict:
    """Load the six agent-visible files of an episode. Never touches private/."""
    pub = Path(root) / "public"
    return {
        "manifest": read_json(pub / "manifest.json"),
        "policy": read_json(pub / "policy.json"),
        "ledger": read_csv(pub / "ledger.csv", LEDGER_INT_COLUMNS),
        "invoices": read_jsonl(pub / "invoices.jsonl"),
        "payments": read_jsonl(pub / "payments.jsonl"),
        "fx": read_csv(pub / "fx.csv"),
    }


# Private files of generated episodes, held in the evaluator's memory after `seal_private` deleted them
# from disk (D-71a): an agent process running as the same user finds no answer key in the temp folder.
_SEALED: dict[str, dict] = {}


def _key(root) -> str:
    return str(Path(root).resolve())


def load_private(root: Path) -> dict:
    """Evaluator-only files. Must never be called from the agent-facing environment."""
    if _key(root) in _SEALED:
        return _SEALED[_key(root)]
    priv = Path(root) / "private"
    return {name.split(".")[0]: read_json(priv / name) for name in PRIVATE_FILES}


def seal_private(root: Path) -> None:
    """Read the private files into evaluator memory and delete them from disk."""
    import shutil

    data = load_private(root)
    shutil.rmtree(Path(root) / "private")
    _SEALED[_key(root)] = data


def release_private(root: Path) -> None:
    _SEALED.pop(_key(root), None)
