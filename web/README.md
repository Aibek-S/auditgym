# AuditGym console

A static, read-only demo of AuditGym episodes: a landing page, an episode archive, a
workbench over the public files (ledger, invoices, payments, FX) with a truth lens, and a
run page that replays the evidence path and shows the stamped score.

Every figure comes from real episode folders. Nothing is computed by a policy here: the
guided review is a recorded replay, and the oracle reads `truth.json` directly. The Python
environment, matcher and runner (issues #4 and #5) are not wired in yet.

## Run

```bash
cd web
npm ci
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
```

## Rebuild the demo data

`public/data/demo.json` is committed, so the console runs without Python. To regenerate it
from the generator (3 fixtures + seeds 2001-2004):

```bash
cd web
npm run export     # python3 scripts/export_demo.py
```

The script writes episode folders to `.demo-cache/` (ignored) and reads only the public files
plus `truth.json` / `provenance.json` for the truth lens.

## Routes

| Path | Page |
| --- | --- |
| `/` | Landing |
| `/console` | Overview: stats, featured case, archive, error mix, reward contract |
| `/console/episodes/:key` | Workbench: tabs, search, truth lens, record drawer |
| `/console/episodes/:key/runs/:run` | Run: trace, P/R/F1, reward, findings |
| `/baselines`, `/method` | Run comparison and the scoring contract |

Stack: Vite 6, React 19, Tailwind 4, IBM Plex Sans/Mono, lucide icons. Motion respects
`prefers-reduced-motion`.
