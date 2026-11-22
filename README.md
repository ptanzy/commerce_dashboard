# Commerce Delivery Intelligence — Documentation Baseline v2

A **local-only** historical Olist e-commerce delivery dashboard in development, demonstrating React, TypeScript, D3 and analytically correct cross-filtering. The repo contains completed WU-00 reconnaissance and the partial WU-01 preprocessing/analytics implementation. **It does not yet contain a finished application.**

## Locked decisions

- React + TypeScript + Vite; Tailwind + semantic tokens; D3/d3-sankey/d3-geo, TanStack Table.
- Offline Python + DuckDB; static JSON with one order row per order and one item row per item.
- Both dark and light themes, dark first-visit default.
- Map defaults to **seller origins**; optional display toggle to customer destinations.
- Initial date filter is **all valid historical purchase dates**.
- Local development/build/preview only; no backend, no GitHub Pages.
- Chart interactions share one filter store; data accuracy takes precedence over chart complexity.

## Source dataset and local arrangement

Download the [Olist Brazilian E-Commerce Public Dataset](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce) and put its ZIP at `data/raw/olist.zip` (or extracted originals within `data/raw/`). The dataset's Kaggle listing states **CC BY-NC-SA 4.0**. Keep source files and generated row-level `public/data/` outputs **ignored by Git** pending explicit redistribution review.

The six required CSVs are listed in `docs/DATA_SPECIFICATION.md`. The source geolocation, reviews and payments CSVs are not needed in P0. Geographic state topology is separate and must have provenance/license and exactly 27 mapped UF codes.

## Documentation guide

| File | Authority |
|---|---|
| `AGENTS.md` | Short entry point for AI coding assistants |
| `docs/WORK_UNITS.md` | WU-00…WU-04 execution, prerequisites, stop gates and reports |
| `docs/DATA_SPECIFICATION.md` | Exact source/export schemas, metric and filter definitions |
| `docs/TESTING_AND_ACCEPTANCE.md` | Test fixtures and P0 release gates |
| `docs/PRODUCT_AND_FEATURES.md` | Feature priorities and user stories |
| `docs/ARCHITECTURE.md` | Canonical folders, state/data ownership and stack |
| `docs/VISUALIZATION_AND_UX.md` | Chart behavior, dark/light UX and accessibility |
| `docs/IMPLEMENTATION_PLAN.md` | Two-day aspiration and five WU sequence |
| `docs/DECISIONS_AND_RISKS.md` | Accepted decisions and remaining source risks |

WU-00 reports: `docs/DATA_PROFILE.md` and `docs/DATA_PROVENANCE.md`. WU-01 implementation handoff: `docs/WU01_HANDOFF.md`.

## Starting development

Read every document first. Request an **inspection-only readiness review** or explicitly authorize a **single WU**. The project currently has five gated WUs: source verification (00), ETL/metrics (01), React shell/KPIs (02), D3 visuals (03), order explorer/QA (04). Authorization for planning or docs updates **does not** authorize application implementation.

WU-01 commands appear below, with executed checks and pending dependency-dependent checks distinguished in `docs/WU01_HANDOFF.md`.

## Recommended .gitignore entries (verify before WU-01)

```gitignore
/data/raw/
/data/processed/
/public/data/
node_modules/
dist/
.venv/
__pycache__/
```

Keep the source files in `data/raw/olist.zip`; if they were already tracked, `.gitignore` alone does not untrack them.

## WU-01 implementation — data pipeline and analytical engine

WU-01 adds backend-free offline preparation scripts, a TypeScript analytical domain,
synthetic tests, and an MIT-licensed geographic conversion tool. **It does not add
React UI components or launch a web app**; those are WU-02 and WU-03 work.

From the repository root with Python 3.12+ and Node 24 installed:

```powershell
python -m pip install -r requirements-etl.txt
python scripts/prepare_data.py --input data/raw/olist.zip --output public/data
python -m unittest discover -s tests -p "test_*.py" -v
npm install
npm run typecheck
npm test
npm run test:node
node tests/check_olist.cjs
```

To produce the **27-state** map asset from the pinned, MIT-licensed GeoJSON:

```powershell
python scripts/prepare_geo.py
```

That final command downloads a pinned, public composite GeoJSON and generates
`public/geo/brazil-states.topojson`, reporting its source and output SHA-256,
feature count, and arc validation. Requires network access for its one-time
source fetch; alternatively save that composite locally and run
`python scripts/prepare_geo.py --source path/to/br_states.json`.
Keep upstream MIT copyright/attribution in `public/geo/LICENSE-geodata-br-states.txt`. Do not confuse it with Olist's
separate noncommercial source-data license.

The `public/data/` directory remains **Git-ignored** and should not be committed.
The geographic TopoJSON is **not** source-derived from Olist; its redistribution
must preserve its upstream MIT license notice. Record the generated SHA and
final verification in `docs/DATA_PROVENANCE.md` after the command succeeds.

See `docs/WU01_HANDOFF.md` for executed verification, environmental blockers,
and the remaining acceptance gate. The presence of commands here does not
imply every one was executed in the assistant environment.
