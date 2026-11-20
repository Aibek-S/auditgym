# Working together (2 people, parallel)

Goal: Aibek and Meirbek work at the same time without breaking each other's work.

## 1. Who owns which folder

| Area | Owner | Folders / files |
|---|---|---|
| Data: generator, errors, truth | Aibek | `auditgym/money.py`, `rng.py`, `history.py`, `ledger.py`, `invariants.py`, `errors.py`, `render.py`, `configs/` |
| Environment: tools, matcher, runner, baselines | Meirbek | `auditgym/env.py`, `matcher.py`, `runner.py`, `policies/`, `cli.py` |
| Shared | both | `docs/`, `tests/fixtures/`, `README.md`, `Dockerfile` |

Edit the other person's files only after agreeing in the issue or PR.

## 2. The contract between the two tracks

The only interface is the **episode folder format**: `public/` (6 open files) and `private/`
(`truth.json`, `provenance.json`, `seed_config.json`), exactly as in `docs/DECISIONS.md`
sections 2, 5, 11.

- Until the generator is ready, the environment is built against **hand-written fixture episodes**
  in `tests/fixtures/` (one clean, one with a duplicate, one with an allocation error).
- Changing the format, the type strings, the evidence rules, or the reward needs a PR that
  updates `docs/DECISIONS.md` and is approved by **both** people.

## 3. Git flow

- One branch per issue: `<issue-number>-short-name`, for example `3-clean-generator`.
- No direct pushes to `main`. Open a PR with `Closes #N`. The other person reviews quickly.
- Small commits. Rebase on `main` before opening a PR.
- `pytest` must pass before merge.

## 4. Daily sync

Short message in the chat at start and end of each work block: what is done, what is next,
and what is blocked.
