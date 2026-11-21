"""AuditGym environment: reset/step, five read-only tools, budget, modes (DECISIONS section 9).

Gymnasium-shaped but dependency-free (D-90):

    env = AuditEnv(scorer=...)
    obs, info = env.reset(seed=7)                       # generate a fresh episode
    obs, info = env.reset(episode_dir="tests/fixtures/duplicate")
    obs, reward, terminated, truncated, info = env.step({"action": "list_records", "table": "invoices"})

Isolation (D-70, D-71): the environment reads ONLY `public/`. Scoring is delegated to an
evaluator-side `scorer(episode_dir, payload, inspection_steps) -> dict` (issue #5), which the
runner wires in. The policy only ever sees JSON observations; nothing here exposes paths,
truth, the seed or exceptions.
"""

from __future__ import annotations

import base64
import copy
import hashlib
import tempfile
import time
from pathlib import Path
from typing import Callable

from auditgym import SCHEMA_VERSION
from auditgym.calculator import CalcError, evaluate
from auditgym.episode import LEDGER_COLUMNS, load_public
from auditgym.submission import coerce, validate

ACTIONS = ("list_records", "get_record", "get_document", "calculator", "submit")
TABLES = ("ledger", "invoices", "payments", "fx")
ERROR_CODES = ("unknown_action", "bad_arguments", "unknown_table", "not_found", "bad_cursor",
               "calc_error", "invalid_submission", "episode_over")
ACTION_ARGS = {
    "list_records": {"table", "cursor", "limit"},
    "get_record": {"table", "id"},
    "get_document": {"doc_id"},
    "calculator": {"expression"},
    "submit": {"findings", "episode_id"},
}
TASK = (
    "You are auditing NorthAngels FoodService Ltd. for one reporting period. Inspect the records with "
    "the tools, then submit findings. Each finding: type (duplicate_invoice | payment_allocation | "
    "fx_conversion | period_cutoff), affected_ids (invoice_id / payment_id), claimed_amount_minor "
    "(misstatement in KZT minor units), currency (KZT), evidence_ids (doc_id, ledger row_id, fx key "
    "'YYYY-MM-DD:CUR:KZT') and a short explanation. Submitting no findings is correct for a clean period."
)

Scorer = Callable[[Path, "dict | None", int], dict]


class AuditEnv:
    def __init__(self, config: dict | None = None, scorer: Scorer | None = None, workdir: str | Path | None = None,
                 clock: Callable[[], float] = time.monotonic):
        from auditgym.generate import load_config

        self.base_config = config or load_config()
        self.scorer = scorer
        self.workdir = Path(workdir) if workdir else None
        self.clock = clock
        self.evaluator_log: list[dict] = []  # evaluator side only; never part of an observation
        self._done = True

    # --- lifecycle -----------------------------------------------------------
    def reset(self, seed: int | None = None, config: dict | None = None, *, episode_dir: str | Path | None = None):
        cfg = copy.deepcopy(self.base_config)
        for key, value in (config or {}).items():
            cfg[key] = {**cfg[key], **value} if isinstance(value, dict) and isinstance(cfg.get(key), dict) else value
        if episode_dir is None:
            if seed is None:
                raise ValueError("reset needs a seed or an episode_dir")
            from auditgym.generate import generate

            root = Path(tempfile.mkdtemp(prefix="auditgym-", dir=self.workdir))
            generate(int(seed), cfg, root)
            episode_dir = root
        self.episode_dir = Path(episode_dir)
        pub = load_public(self.episode_dir)
        env_cfg = cfg["env"]
        self.mode = env_cfg["mode"]
        self.max_steps = env_cfg["max_steps"]
        self.page_limit = env_cfg["page_limit"]
        self.time_limit = env_cfg["time_limit_s"]
        self.limits = cfg["submission_limits"]
        self.manifest, self.policy = pub["manifest"], pub["policy"]
        self.episode_id = self.manifest["episode_id"]
        self.tables = {t: pub[t] for t in TABLES}
        for row in self.tables["fx"]:
            row["fx_key"] = f'{row["date"]}:{row["source_currency"]}:{row["target_currency"]}'
        self.index = {
            "ledger": {r["row_id"]: r for r in self.tables["ledger"]},
            "invoices": {**{r["invoice_id"]: r for r in self.tables["invoices"]},
                         **{r["doc_id"]: r for r in self.tables["invoices"]}},
            "payments": {**{r["payment_id"]: r for r in self.tables["payments"]},
                         **{r["doc_id"]: r for r in self.tables["payments"]}},
            "fx": {r["fx_key"]: r for r in self.tables["fx"]},
        }
        self.documents = {r["doc_id"]: ("invoice", r) for r in self.tables["invoices"]}
        self.documents.update({r["doc_id"]: ("payment", r) for r in self.tables["payments"]})
        self.steps_used = 0
        self._done = False
        self._started = self.clock()
        result = {
            "task": TASK,
            "manifest": self.manifest,
            "policy": self.policy,
            "tables": {
                "ledger": {"count": len(self.tables["ledger"]), "columns": LEDGER_COLUMNS, "id": "row_id"},
                "invoices": {"count": len(self.tables["invoices"]), "id": "invoice_id or doc_id",
                             "note": "list_records omits line_items; use get_document"},
                "payments": {"count": len(self.tables["payments"]), "id": "payment_id or doc_id"},
                "fx": {"count": len(self.tables["fx"]), "id": "fx_key (YYYY-MM-DD:CUR:KZT)"},
            },
            "actions": {
                "list_records": {"table": list(TABLES), "cursor": "string or null", "limit": f"1..{self.page_limit}"},
                "get_record": {"table": list(TABLES), "id": "string"},
                "get_document": {"doc_id": "string"},
                "calculator": {"expression": "numbers, + - * / ( ), max 200 chars"},
                "submit": {"findings": {"episode_id": self.episode_id, "findings": "list"}},
            },
            "limits": {"max_steps": self.max_steps, "page_limit": self.page_limit,
                       "time_limit_s": self.time_limit, **self.limits},
        }
        return self._obs(True, result, None), self._info()

    def step(self, action):
        if self._done:
            return self._obs(False, None, self._err("episode_over", "the episode has ended; call reset")), 0.0, \
                False, False, self._info()
        self.steps_used += 1
        if self.clock() - self._started > self.time_limit:
            return self._truncate("time limit exceeded")

        name = action.get("action") if isinstance(action, dict) else None
        if name == "submit":
            return self._submit(action)
        if name not in ACTIONS:
            obs = self._obs(False, None, self._err("unknown_action", f"actions: {', '.join(ACTIONS)}"))
        else:
            extra = set(action) - {"action"} - ACTION_ARGS[name]
            if extra:
                obs = self._obs(False, None, self._err("bad_arguments", f"unknown arguments: {', '.join(sorted(extra))}"))
            else:
                obs = getattr(self, "_" + name)(action)
        if self.steps_used >= self.max_steps:
            return self._truncate("step limit reached without submit", obs)
        return obs, 0.0, False, False, self._info()

    # --- tools ---------------------------------------------------------------
    def _list_records(self, a):
        table = a.get("table")
        if table not in TABLES:
            return self._obs(False, None, self._err("unknown_table", f"tables: {', '.join(TABLES)}"))
        limit = a.get("limit", self.page_limit)
        if type(limit) is not int:
            return self._obs(False, None, self._err("bad_arguments", "limit must be an integer"))
        limit = max(1, min(self.page_limit, limit))
        offset = 0
        if a.get("cursor") is not None:
            offset = self._decode_cursor(a["cursor"], table)
            if offset is None:
                return self._obs(False, None, self._err("bad_cursor", "cursor is not valid for this table"))
        rows = self.tables[table][offset:offset + limit]
        if table == "invoices":
            rows = [{k: v for k, v in r.items() if k != "line_items"} for r in rows]
        end = offset + len(rows)
        cursor = self._encode_cursor(table, end) if end < len(self.tables[table]) else None
        return self._obs(True, {"table": table, "offset": offset, "rows": copy.deepcopy(rows),
                                "next_cursor": cursor, "total": len(self.tables[table])}, None)

    def _get_record(self, a):
        table, rid = a.get("table"), a.get("id")
        if table not in TABLES:
            return self._obs(False, None, self._err("unknown_table", f"tables: {', '.join(TABLES)}"))
        if not isinstance(rid, str):
            return self._obs(False, None, self._err("bad_arguments", "id must be a string"))
        record = self.index[table].get(rid.strip())
        if record is None:
            return self._obs(False, None, self._err("not_found", f"no {table} record with this id"))
        if table == "invoices":
            record = {k: v for k, v in record.items() if k != "line_items"}
        return self._obs(True, {"table": table, "record": copy.deepcopy(record)}, None)

    def _get_document(self, a):
        doc_id = a.get("doc_id")
        if not isinstance(doc_id, str):
            return self._obs(False, None, self._err("bad_arguments", "doc_id must be a string"))
        found = self.documents.get(doc_id.strip())
        if found is None:
            return self._obs(False, None, self._err("not_found", "no document with this doc_id"))
        kind, record = found
        return self._obs(True, {"kind": kind, "document": copy.deepcopy(record)}, None)

    def _calculator(self, a):
        try:
            value = evaluate(a.get("expression"))
        except CalcError as exc:
            return self._obs(False, None, self._err("calc_error", str(exc)))
        return self._obs(True, {"value": value}, None)

    # --- submit and endings --------------------------------------------------
    def _submit(self, action):
        self._done = True
        payload = coerce(action)
        reason = validate(payload, self.episode_id, self.limits)
        inspection_steps = self.steps_used - 1
        if reason is not None:
            score = {"reward": -1.0, "malformed": True, "reason": reason, "inspection_steps": inspection_steps}
            self._log("submit", score)
            obs = self._obs(False, None, self._err("invalid_submission", "submission does not match the schema"))
            return obs, self._visible(score), True, False, self._info()
        score = self._score(payload, inspection_steps)
        self._log("submit", score)
        result = {"submitted": True, "findings": len(payload["findings"]), "inspection_steps": inspection_steps}
        return self._obs(True, result, None), self._visible(score), True, False, self._info()

    def _truncate(self, why, last_obs=None):
        self._done = True
        score = self._score(None, self.steps_used)
        score["truncated_reason"] = why
        self._log("truncated", score)
        if last_obs is None:
            last_obs = self._obs(False, None, self._err("episode_over", why))
        last_obs["steps_used"], last_obs["steps_remaining"] = self.steps_used, 0
        return last_obs, self._visible(score), False, True, self._info()

    def _score(self, payload, inspection_steps) -> dict:
        empty = {"episode_id": self.episode_id, "findings": []}
        if self.scorer is None:  # until #5 wires the matcher in
            return {"reward": 0.0, "scored": False, "inspection_steps": inspection_steps}
        return dict(self.scorer(self.episode_dir, payload or empty, inspection_steps))

    def _visible(self, score) -> float:
        return float(score["reward"]) if self.mode == "open" else 0.0

    def _log(self, event, score):
        self.evaluator_log.append({"episode_id": self.episode_id, "event": event, "steps_used": self.steps_used,
                                   "mode": self.mode, **score})

    # --- helpers -------------------------------------------------------------
    def _obs(self, ok, result, error):
        return {"ok": ok, "result": result, "error": error, "steps_used": self.steps_used,
                "steps_remaining": max(0, self.max_steps - self.steps_used)}

    @staticmethod
    def _err(code, message):
        assert code in ERROR_CODES
        return {"code": code, "message": message}

    def _info(self):
        return {"episode_id": self.episode_id, "schema_version": SCHEMA_VERSION, "mode": self.mode,
                "steps_used": self.steps_used}

    def _tag(self, table, offset) -> str:
        return hashlib.sha256(f"{self.episode_id}:{table}:{offset}".encode()).hexdigest()[:10]

    def _encode_cursor(self, table, offset) -> str:
        raw = f"{table}:{offset}:{self._tag(table, offset)}"
        return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")

    def _decode_cursor(self, cursor, table):
        if not isinstance(cursor, str) or len(cursor) > 80:
            return None
        try:
            raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)).decode()
            t, offset, tag = raw.split(":")
            offset = int(offset)
        except (ValueError, UnicodeDecodeError):
            return None
        if t != table or tag != self._tag(t, offset) or not 0 <= offset <= len(self.tables[table]):
            return None
        return offset
