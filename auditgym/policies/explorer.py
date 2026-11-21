"""Explorer: a deterministic scripted demo policy (no truth, no LLM).

It pages through every table, opens a sample of documents, recomputes one FX conversion with the
calculator and submits no findings. It shows the contract in the live console; it is not a
baseline for scoring (those come in #5).
"""

from __future__ import annotations

import random


class Explorer:
    name = "explorer"

    def __init__(self, seed: int = 0, max_documents: int = 8):
        self.r = random.Random(f"explorer:{seed}")
        self.max_documents = max_documents
        self.queue: list[dict] = []
        self.episode_id = None
        self.tables = ["invoices", "payments", "ledger", "fx"]
        self.cursor: dict[str, str | None] = {}
        self.docs: list[str] = []
        self.fx_doc = None

    def act(self, observation: dict) -> dict:
        result = observation.get("result") or {}
        if self.episode_id is None:
            self.episode_id = result["manifest"]["episode_id"]
        if isinstance(result, dict) and "rows" in result:
            table = result["table"]
            for row in result["rows"]:
                if "doc_id" in row:
                    self.docs.append(row["doc_id"])
                    if row.get("currency") not in (None, "KZT") and self.fx_doc is None:
                        self.fx_doc = row
            self.cursor[table] = result["next_cursor"]
            if result["next_cursor"] is None:
                self.tables.remove(table)
        budget = observation["steps_remaining"]
        if self.tables and budget > self.max_documents + 3:
            table = self.tables[0]
            return {"action": "list_records", "table": table, "cursor": self.cursor.get(table), "limit": 50}
        if self.docs and self.max_documents > 0 and budget > 3:
            self.max_documents -= 1
            return {"action": "get_document", "doc_id": self.docs.pop(self.r.randrange(len(self.docs)))}
        if self.fx_doc is not None:
            doc, self.fx_doc = self.fx_doc, None
            amount = doc.get("total_minor", doc.get("amount_minor"))
            return {"action": "calculator", "expression": f"{abs(amount)} * 1.00"}
        return {"action": "submit", "findings": {"episode_id": self.episode_id, "findings": []}}
