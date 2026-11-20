# AuditGym

> Status: **design / documentation stage**. Nothing here is implemented or approved yet.
> All design decisions below are proposals for review by the two-person planning team.

## What it is

AuditGym is a reproducible reinforcement-learning (RL) environment for an AI financial auditor.
It is the team's submission for the FinTech case "RL environments for fine-tuning financial
audit models" (online stage 19-22 November 2026).

The deliverable is the **environment**, not a trained model, a chatbot, or an audit report:

- a generator of synthetic company records with hidden, recorded accounting errors;
- an agent-facing environment with a narrow, read-only tool interface (`reset` / `step`);
- an independent evaluator that matches findings against hidden ground truth and
  computes the official reward.

## The problem

An auditor model can only be trained or compared fairly if it is evaluated on many
episodes where the correct answer is known, the evidence is actually available, and
the score cannot be gamed by guessing, flagging everything, or writing convincing text.
AuditGym provides those episodes and that scoring.

## How a simulation works (high level)

1. `reset(seed, config)` generates one fictional company and one reporting period:
   a consistent hidden business history, the documents derived from it, and 0-12
   injected errors whose causal change is recorded in hidden ground truth.
2. The agent investigates using five actions: `list_records`, `get_record`,
   `get_document`, `calculator`, `submit`. Max 100 steps per episode.
3. `submit(findings)` ends the episode. The evaluator, outside the agent process,
   matches findings one-to-one against ground truth and computes:

   `R = clip(2 * F1 - 1 - 0.002 * inspection_steps, -1, 1)`

## The synthetic company

Episodes simulate **NorthAngels FoodService Ltd.**, a fictional food wholesaler and
foodservice distributor whose business model is *inspired by* the publicly documented
model of METRO AG (wholesale + delivery to HoReCa and independent traders). We do not
reproduce METRO's real accounting, data, or transactions. See
[docs/CASE_OVERVIEW.md](docs/CASE_OVERVIEW.md).

## Documents

| Document | Purpose |
|---|---|
| [docs/DECISIONS.md](docs/DECISIONS.md) | **Main spec.** All rules we decided ourselves (D-xx ids). Wins over every other doc |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Milestones M0-M10, owners, estimates, cut order, tests per jury criterion |
| [docs/CASE_OVERVIEW.md](docs/CASE_OVERVIEW.md) | METRO reference, verified facts vs our assumptions |
| [docs/BUSINESS_MODEL.md](docs/BUSINESS_MODEL.md) | NorthAngels operations and normal financial flow |
| [docs/SCOPE.md](docs/SCOPE.md) | MVP in scope / out of scope / future |
| [docs/BOUNDARIES.md](docs/BOUNDARIES.md) | Agent access, hidden data, isolation, anti-exploit rules |
| [docs/ERROR_SCENARIOS.md](docs/ERROR_SCENARIOS.md) | The four official error types, evidence, false positives |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Component diagram and data flow |
| [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) | Unresolved decisions with recommended defaults |
| [docs/REFERENCES.md](docs/REFERENCES.md) | External sources and what they support |

## Current stage

Documentation only. No datasets, code, schemas, or dependencies exist yet.
We cannot ask the organizers, so every unclear detail is decided by us in
`docs/DECISIONS.md` (status: proposed). Next step: the team approves it, then
implementation starts with milestone M0-M1 in `docs/IMPLEMENTATION_PLAN.md`.

The official case brief is the primary source of requirements. Where this documentation
and the brief disagree, the brief wins.
