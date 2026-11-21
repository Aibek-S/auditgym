# auditgym web

Two pages, built by Vite:

- `/` is the landing page (`index.html`): a static page on the design-taste-frontend kit
  (`public/assets`: system, motion, layout, the line-engraving effect, the iris-opens and word-highlight
  moments). `src/landing/main.ts` loads the fonts and switches the language.
- `/console` is the console (`console.html`, React): episode archive, workbench, runs, agents, method.

Every figure comes from real episode folders (`public/data/demo.json`). Nothing is computed by a policy:
the guided review is a recorded replay and the oracle reads `truth.json` directly. The Python
environment, matcher and runner (issues #4 and #5) are not wired in yet, and both pages say so.

## Run

```bash
cd web
npm ci
npm run dev        # http://localhost:5173 (landing) and /console
npm run build      # type-check + build into dist/
```

`vite.config.ts` rewrites `/console/*` to `console.html` in dev and preview. A static host needs the
same rewrite.

## Rebuild the demo data

```bash
cd web
npm run export     # python3 scripts/export_demo.py: 3 fixtures + seeds 2001-2004
```

## Live run (real environment)

`/console/live` drives the real Python environment through a local bridge:

```bash
.venv/bin/python -m auditgym serve --port 8765   # in the project root
cd web && npm run dev                            # open http://localhost:5173/console/live
```

Pick a seed and the planted errors, then run the scripted `explorer` agent: each step streams in as a
server-sent event. You can also send any action by hand as JSON. The answer key is locked while the
episode runs and opens after `submit` (or truncation). Override the API address with
`VITE_AUDITGYM_API`. The bridge is a demo tool, not part of the official offline check.

## Console routes

| Path | Page |
| --- | --- |
| `/console` | Archive, dataset, reward contract, error mix, worked example, isotype, provenance, run scatter |
| `/console/episodes/:key` | Workbench: record list beside the open record, answer key on demand (`?truth=1`, `?issue=ISS-01`, `?record=ledger:L-ABC`) |
| `/console/episodes/:key/runs/:run` | Steps table with a sticky state panel, isotype score, verdict stamp |
| `/console/live` | Live run against `python -m auditgym serve`: streamed steps, manual actions, answer key after the end |
| `/console/agents` | Run scatter above the runs table, copy and CSV |
| `/console/method` | Tools, scoring, answer key |

## Design

The look follows a frontend brief answered by the team (palette near-black with no accent, light by the
system setting; Familjen Grotesk with Golos Text for Cyrillic and Kazakh letters; Red Hat Mono for ids and
amounts; 2-4px corners; stamps for verdicts; amounts as `78 400.00 KZT`, dates as `01.09.2026`).
Patterns taken from references: every number links to its evidence (Epoch AI), provenance block and
answer-key SHA-256 (Our World in Data), run scatter above the table (ARC Prize), episode byline (Distill),
clean value beside the booked one (Ink & Switch), scrubbable numbers (Bret Victor), sticky run state
(AI 2027), copy a run's config (PufferLib), isotype marks (Neurath), FX conversion as an equation (Tally),
ditto marks and double rules (ledger books), status written over the document, posting stamps, field
numbers with dot leaders (IRS 1040), finding list linked to rows (GOV.UK).

Languages: Kazakh, Russian, English (switch in the header; the choice is shared by both pages). The Kazakh
text is a first translation and needs a native speaker's check.

The finding colours switch between red/blue and orange/blue for colour-vision deficiency.
