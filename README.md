# AuditGym

A reproducible RL environment for an AI financial auditor: synthetic company records, hidden planted
errors with recorded causes, a narrow read-only tool interface, and an independent evaluator with the
official reward. Submission for the FinTech case "RL environments for fine-tuning financial audit
models" (19-22 November 2026).

The deliverable is the **environment**, not a trained model. Weights are not trained; no improvement
of any model is claimed.

## One command

```bash
docker build -t auditgym .
docker run --rm --network none --cpus 2 --memory 4g auditgym
```

Without Docker (Python 3.11+, standard library only; `pytest` for the tests):

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m auditgym check          # writes results/
```

`check` exits 0 only if every step passes:

1. the 20 published episodes in `episodes/` are regenerated from their seeds and compared byte for byte;
2. each episode is verified independently: the clean twin (same seed, no errors) satisfies every
   accounting invariant; after injection the invariant violations recomputed from the **public** files
   equal exactly the issues in `truth.json`; every acceptable evidence set reproduces its amount;
3. the test suite runs (environment contract, matcher, reward, attacks, leaks, reproducibility);
4. the four baselines run on train + dev through the real environment and evaluator; trajectories,
   evaluator logs and the metrics table are written to `results/`.

## Results (`results/metrics.md`, 20 published episodes)

| policy | TP/FP/FN | mean F1 | mean return | mean inspection steps |
|---|---|---|---|---|
| oracle (reads the answer key; checks the maximum only) | 48/0/0 | 1.000 | +1.000 | 0.0 |
| reconcile (rules from `policy.json`) | 48/0/0 | 1.000 | +0.923 | 38.5 |
| random (fixed seed) | 0/35/48 | 0.050 | -0.902 | 35.3 |
| flag_all (attack) | 0/600/48 | 0.000 | -1.000 | 2.0 |

These are diagnostics of the environment, not a claim about agent quality. Time per episode is
about 0.2 s (limit 60 s).

## How an episode works

```python
from auditgym.env import AuditEnv
from auditgym.matcher import score_episode

env = AuditEnv(scorer=score_episode)            # mode "open" returns the terminal reward
obs, info = env.reset(seed=1001)                # task, manifest, policy, table sizes, 100 steps
obs, reward, terminated, truncated, info = env.step({"action": "list_records", "table": "invoices", "limit": 50})
obs, reward, terminated, truncated, info = env.step({"action": "get_document", "doc_id": "DOC-..."})
obs, reward, terminated, truncated, info = env.step({"action": "submit", "findings": {
    "episode_id": info["episode_id"],
    "findings": [{"type": "duplicate_invoice", "affected_ids": ["INV-A", "INV-B"],
                  "claimed_amount_minor": 7840000, "currency": "KZT",
                  "evidence_ids": ["DOC-A", "DOC-B", "L-ROW"], "explanation": "same delivery note"}]}})
```

- Actions: `list_records(table, cursor, limit<=50)`, `get_record(table, id)`, `get_document(doc_id)`,
  `calculator(expression)` (decimal arithmetic only), `submit(findings)`. Every call costs one step;
  100 steps max; 60 s wall clock; errors are bounded codes and also cost a step.
- Reward (official, unchanged): `R = clip(2*F1 - 1 - 0.002*inspection_steps, -1, 1)`, where
  inspection steps are all steps before `submit`. Malformed submission: -1. Truncation: empty findings.
- Modes: `open` returns the terminal reward; `closed` returns 0 to the policy and keeps the score in
  the evaluator log only.

## Data

One episode = one fictional company (NorthAngels FoodService Ltd., food wholesale and delivery to
HoReCa and traders; business model inspired by public METRO AG reports) and one calendar month.
Public files: `manifest.json`, `ledger.csv`, `invoices.jsonl`, `payments.jsonl`, `fx.csv`,
`policy.json`. Private (evaluator only): `truth.json`, `provenance.json`, `seed_config.json`.
Money is integer minor units, rates are decimal strings, timestamps carry offsets, missing links are
`null`. Ledger amounts are in base currency KZT; documents may be USD or EUR.

Errors (four types, independently configurable): `duplicate_invoice`, `payment_allocation`,
`fx_conversion`, `period_cutoff`. Interacting scenarios: **I1** an FX invoice issued just after the
period end, rendered in UTC, booked with the UTC date (cutoff + FX, plus a legitimate partial foreign
payment); **I2** a duplicated invoice whose full payment is applied only partly (duplicate + allocation).
Every episode carries at least 15 kinds of legitimate look-alikes (tested) (recurring orders, corrections with reversal,
split and combined payments, underpayments, overpayments, unreferenced receipts, realised FX, weekend
rates, midnight timestamps in other offsets, large foreign orders).

Published splits: `episodes/train` seeds 1001-1010 and `episodes/dev` seeds 2001-2010, each with
3 clean, 3 interacting and 4 single-error episodes. Hidden evaluation can use any other seed, plus
`id_salt` / `order_mode=shuffled` for paired id and order transforms.

## Isolation

The environment loads only `public/`. The runner owns the environment and the evaluator; an agent
runs as a subprocess speaking JSON lines (`python -m auditgym.runner`) and never receives paths,
files or object references. A hung agent is killed and the episode truncates. The oracle runs only
on the evaluator side. Tests scan every observation and trajectory for truth-only tokens.

## Matching rules (published)

`auditgym/matcher.py`: type normalized (case, spaces, dashes, public alias table); `affected_ids`
compared as a set, doc ids and business ids interchangeable; currency uppercase; amount within 100
minor units (1 KZT); evidence must contain at least one full acceptable set (extra ids allowed);
maximum one-to-one bipartite matching with a deterministic order; repeats are false positives;
`explanation` never affects the score.

## Limitations (honest)

- **Difficulty.** A rule-based reconciliation finds every planted error on the published episodes.
  The environment demonstrates correct, hack-resistant scoring; it does not yet provide a hard task.
- One business type, one base currency, one month per episode; sales side only (purchases are
  aggregate ledger rows without documents or errors).
- I1 cannot exist when the month ends on Fri-Sun (both dates map to Friday's rate); the generator
  then uses I2.
- A timeout is the only source of non-determinism in replay.
- Reward success does not mean fitness for real audit work; all data is synthetic.

## Repository

| Path | Content |
|---|---|
| `auditgym/` | generator (`history`, `ledger`, `errors`, `render`), checks (`invariants`), environment (`env`, `calculator`), evaluator (`matcher`), `runner`, `policies/`, `check`, live bridge `serve` |
| `episodes/` | 10 train + 10 dev published episodes |
| `results/` | written by `check`: `metrics.md/json`, `trajectories.jsonl` (all four policies; observations never contain truth, but the oracle's own `submit` action is the answer key by definition, so do not train on oracle lines), evaluator logs |
| `tests/` | contract, data, matcher, reward, attacks, leaks, reproducibility |
| `docs/DESIGN_NOTE.md` | short design note |
| `docs/DECISIONS.md` | every rule we decided ourselves (D-xx) |
| `web/` | landing page and console with a live run (`python -m auditgym serve`, then `npm run dev`) |

Versions: generator 0.1.0, schema 1.0, `decisions-v0.1`, config `default` v1 (printed by `check`).
License: MIT.
