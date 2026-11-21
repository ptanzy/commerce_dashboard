# Commerce Delivery Intelligence — POC Documentation

**Status:** Updated design baseline / implementation not started  
**Target:** A polished, static, English-language React/D3 dashboard demonstrating real Brazilian e-commerce delivery analytics in approximately two focused development days (planning target, not a guarantee).  
**Repository:** `ptanzy/commerce_dashboard`  
**Source data:** [Olist Brazilian E-Commerce Public Dataset](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce) (historical data, primarily 2016–2018).

This archive contains **documentation only**. It does not alter the GitHub repository, contain production source code, or redistribute Olist CSV files.

## Reading order

1. [`docs/PRODUCT_AND_FEATURES.md`](docs/PRODUCT_AND_FEATURES.md) — Product purpose, screen, capabilities and prioritized acceptance stories.
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Stack, design boundaries, data delivery, React/D3 integration and local execution.
3. [`docs/DATA_SPECIFICATION.md`](docs/DATA_SPECIFICATION.md) — Raw input files, relational cardinality, derived fields, aggregation and data correctness contracts.
4. [`docs/VISUALIZATION_AND_UX.md`](docs/VISUALIZATION_AND_UX.md) — Screen layout, exact chart behavior, filters, drill-through and accessibility.
5. [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — Three short phases, dependency order, implementation checklist and explicit stop rules.
6. [`docs/TESTING_AND_ACCEPTANCE.md`](docs/TESTING_AND_ACCEPTANCE.md) — Automated tests, manual checks, data integrity tests and release gate.
7. [`docs/DECISIONS_AND_RISKS.md`](docs/DECISIONS_AND_RISKS.md) — Decisions, deferred features, risks, and remaining data-discovery questions.

## Product definition

Users investigate **where deliveries occur, how reliably they arrive, and how shipping charges vary across Brazil**. The app combines KPI cards, a state-level map, origin-to-destination Sankey, time-based performance, and an order-level investigation table. Interactions update all relevant views in a predictable way.

**What this is not:** package GPS tracking, a live carrier dashboard, a route planner, a full e-commerce management suite, or a statistically representative logistics simulation.

## Locked presentation and execution defaults

- **Light and dark themes** with a visible, keyboard-accessible toggle; **dark is default**. Theme selection persists in localStorage, with safe fallback if storage is unavailable. CSS tokens style both charts and application UI.
- **Local-only execution** using Vite (`npm run dev` and `npm run preview`); no hosted deployment, GitHub Pages, or publishing requirement for this POC.
- **Initial map:** seller-origin state choropleth; user may switch to customer-destination state. Clicking map state filters the corresponding state dimension, not always destination.
- **Initial date range:** all available valid purchase dates; actual extent comes from data profiling, not an invented interval.
- Uploaded Olist archive is expected locally at `data/raw/olist.zip`, untracked. Prior data profiling claims must be independently verified during WU-00.

## Implementation commitments

- **One-page**, desktop-first but responsive app.
- React + TypeScript + Vite, Tailwind CSS, D3 (`d3-geo`, `d3-sankey`), `topojson-client`, TanStack Table.
- Preprocessing in Python using DuckDB if beneficial, with Pandas allowed for simple transformations; no server runtime.
- Static processed data, source metadata and reproducible preprocessing commands.
- Honest handling of orders with multiple items/sellers and missing dates.
- Explicit data provenance and metric definitions.
- No authentication, backend, live integration, forecasting, route simulation, or unnecessary state framework.

## Starting the work

The repository owner should place these documents at the repository root (`README.md` and `docs/`), obtain the dataset separately, and use `docs/IMPLEMENTATION_PLAN.md` for the first task. **Do not treat the architecture as proof that the raw data has already been inspected.** The first implementation step must profile the actual downloaded CSVs and record findings.

## AI implementation instructions

Agents should read [`AGENTS.md`](AGENTS.md), then [`docs/WORK_UNITS.md`](docs/WORK_UNITS.md) and the linked specifications before proposing edits. Work proceeds one authorized WU at a time.
