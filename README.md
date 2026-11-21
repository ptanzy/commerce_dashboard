# Commerce Delivery Intelligence — Documentation Baseline v2

A planned **local-only** historical Olist e-commerce delivery dashboard, demonstrating React, TypeScript, D3 and analytically correct cross-filtering. This repository currently holds **specifications and AI work instructions, not a finished application**.

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

Future reports added during WU-00: `docs/DATA_PROFILE.md` and `docs/DATA_PROVENANCE.md`. They are not completed yet.

## Starting development

Read every document first. Request an **inspection-only readiness review** or explicitly authorize a **single WU**. The project currently has five gated WUs: source verification (00), ETL/metrics (01), React shell/KPIs (02), D3 visuals (03), order explorer/QA (04). Authorization for planning or docs updates **does not** authorize application implementation.

Exact npm/ETL commands will be added to this README when the implementation exists and is verified. Do not present speculative commands as tested.

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
