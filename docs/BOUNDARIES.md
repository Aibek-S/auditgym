# Security and Operational Boundaries

Status: proposal for review. **[OFFICIAL CASE]** marks requirements from the brief.

The core rule: **the agent sees only open records, only through five tools, only read-only.
Everything the evaluator knows stays in a different process.** A leak of hidden data blocks
grading entirely [OFFICIAL CASE], so this document is as important as the reward function.

## 1. What the agent can access

| Information | How |
|---|---|
| Task text, manifest, short policy summary, remaining budget | first observation from `reset` [OFFICIAL CASE] |
| Rows of `ledger`, `invoices`, `payments`, `fx` | `list_records` (max 50 per page, stable cursor), `get_record` |
| Full document (invoice or payment with line items) | `get_document(doc_id)` |
| Arithmetic results | `calculator(expression)` |
| Remaining steps, result or bounded error of the last action | every observation [OFFICIAL CASE] |
| Terminal reward | only in **open training mode**, only after `submit` [OFFICIAL CASE] |

## 2. What must remain hidden

- `truth.json` (issues, affected ids, expected amounts, evidence sets).
- `provenance.json` (generation history, injected changes, the clean "before" version).
- The seed, the internal RNG state, and the config fields that reveal error counts or types.
  Open question F2: whether the error count in config is visible at all.
- Evaluator logs, per-finding match diagnostics, and the reward in closed evaluation mode
  until the run ends [OFFICIAL CASE].
- Internal file paths and storage layout. Records are addressed by public ids only.

## 3. Leak channels to close

| Channel | Risk | Proposed control |
|---|---|---|
| Observation content | truth fields copied into records | Observations are built from an allow-list of open-table fields only. |
| IDs | injected records get ids like `INV-DUP-1`, or ids that sort or number differently | All ids drawn from one random id space after injection, then shuffled. |
| Order | injected rows appended at the end of tables | Tables re-sorted or shuffled after injection, so cursor order carries no signal. |
| Error messages | "id not found in truth", stack traces, paths | Fixed small set of error codes and messages. No exceptions or paths in observations. |
| `info` dict | debug data, issue counts | `info` contains only public fields (step count, mode, version). |
| Timing | slower responses for injected records | Uniform in-memory lookup. Low risk, noted. |
| Formatting artifacts | injected amounts have different rounding or precision | Errors are injected into the hidden history, then documents are rendered by the same renderer for every record. |
| Reward / explanations | per-finding feedback during closed runs | Closed mode: reward 0 for every step including submit; diagnostics only in evaluator logs. |
| Trajectories | `trajectories.jsonl` used for training includes truth | Trajectory writer logs only the observation the agent saw. Tested by a leak test that searches logs for truth-only values. |

## 4. Allowed operations

Only the five actions [OFFICIAL CASE]:

- `list_records(table, cursor, limit)`, where `table` is from an allow-list and `limit <= 50`;
- `get_record(table, id)`;
- `get_document(doc_id)`;
- `calculator(expression)`, which accepts only numbers (including decimals), `+ - * /`,
  parentheses, and unary minus. Uses decimal arithmetic. No names, functions, attributes,
  exponent operators, or code execution. Bounded input length.
- `submit(findings)`, which ends the episode.

## 5. Forbidden operations

- Any write to records. The agent **cannot modify financial records**. The environment
  holds an immutable copy per episode.
- Shell, terminal, SQL, database, filesystem, internet, environment variables [OFFICIAL CASE].
- Reading `truth`, `provenance`, seed, or evaluator state by any action or argument.
- Submitting twice. The episode has already terminated; further steps return an error
  without re-scoring (open question G4 on exact behavior).

## 6. Error and budget handling

- Unknown action, unknown table, unknown id, or malformed arguments -> bounded error
  observation, **consumes one step** [OFFICIAL CASE].
- Step 100 is the hard limit including `submit` [OFFICIAL CASE].
- Step or time limit exceeded -> `truncated=true`, final answer = empty findings [OFFICIAL CASE].
- Malformed `submit` structure -> episode ends, reward -1, error logged by evaluator only [OFFICIAL CASE].
- Input size caps: max 30 findings, 10 evidence ids each, 1,000 characters of explanation [OFFICIAL CASE].

## 7. Evaluator isolation

- The evaluator runs **outside the agent process** [OFFICIAL CASE]. Proposed: the runner
  process owns the environment and evaluator. The agent policy talks to it only through
  serialized JSON actions and observations. A policy adapter never receives Python object
  references to environment internals.
- Hidden files are written to a directory the agent-facing layer never opens. In the container,
  open episode data and evaluator data are separate paths. The policy process has no mount of
  the evaluator path (exact mechanism: open question F1).
- The evaluator only reads. It does not accept writes from the agent side. The case lists
  "writing into the evaluator" as grading-blocking [OFFICIAL CASE].
- Reward explanations (which findings matched) go to evaluator logs, not to observations.

## 8. Reproducibility and reset isolation

- `reset(seed, config)` builds all episode state from scratch. No state carries over between
  episodes (no caches keyed by anything except seed + config + version) [OFFICIAL CASE].
- Same seed, config, version, and actions -> identical records, transitions, rewards [OFFICIAL CASE].
- Paired check: permuting order and re-mapping ids must keep the oracle's answer and reward
  unchanged after mapping ids [OFFICIAL CASE]. So no logic may depend on id text or row order.

## 9. Anti-exploit summary

| Exploit | Defense |
|---|---|
| Flag every row or every type | FP count lowers F1. The reward goes negative. Tested. |
| Duplicate findings | One-to-one matching. Repeats are FP. Tested. |
| Guessed ids without evidence | TP requires a full acceptable evidence set. |
| Convincing explanation text | Reward ignores `explanation` content. |
| Wrong currency or amount | TP requires matching currency and amount within declared tolerance. |
| Probing errors for information | Errors are generic and cost a step. |
| Using the calculator as an interpreter | Grammar allow-list, decimal-only. |
| Inferring truth from ids or order | Random ids, shuffle after injection, paired permutation test. |
