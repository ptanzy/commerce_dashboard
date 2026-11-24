# Commerce Delivery Intelligence — Local Dashboard POC

A **local-only** historical Olist e-commerce delivery dashboard in development, demonstrating React, TypeScript, D3 and analytically correct cross-filtering. WU-00 through WU-03 are implemented and committed on the feature branch; **WU-04 adds the searchable order explorer and order details**. Release acceptance remains pending successful local tests and a human browser walkthrough.

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

WU-00 reports: `docs/DATA_PROFILE.md` and `docs/DATA_PROVENANCE.md`. Work-unit handoffs: `docs/WU01_HANDOFF.md` through `docs/WU04_HANDOFF.md`.

## Starting development

Read every document first. Request an **inspection-only readiness review** or explicitly authorize a **single WU**. The project currently has five gated WUs: source verification (00), ETL/metrics (01), React shell/KPIs (02), D3 visuals (03), order explorer/QA (04). Authorization for planning or docs updates **does not** authorize application implementation.

Implementation and local testing commands are below. Only tests actually run are marked passed in the corresponding work-unit handoffs.

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

## WU-02 React dashboard shell — implementation review

WU-02 adds the **local Vite React/TypeScript dashboard shell** with Tailwind,
responsive dark/light presentation, shared filters, verified schema loading,
four live-data KPI cards, filter chips, error/loading/empty states, and UI tests.
It does **not** implement the D3 geographic map, monthly chart, Sankey, or order
explorer; those are WU-03 and WU-04 work. Chart areas are explicitly marked
as future work rather than showing misleading placeholder data.

The WU-01 Python pipeline must have already written the three files
`public/data/orders.json`, `items.json`, and `metadata.json` on your computer;
those files are Git-ignored and are **not** included in the source ZIP or GitHub.
Regenerate them if missing:

```powershell
python scripts/prepare_data.py --input data/raw/olist.zip --output public/data
```

From the repository root, on `feature/dashboard-poc`:

```powershell
npm install                 # Update package-lock.json for React/Vite/Tailwind/RTL
npm run typecheck           # Full TypeScript check
npm test                    # Vitest analytics + React Testing Library
npm run test:node           # Separate Node analytics regression tests
npm run build               # Production Vite build (base: '/')
npm run dev                 # Local UI at http://127.0.0.1:5173/
```

Optional: `npm run preview` after building, to inspect production assets locally.
The UI reads static JSON from `/data/`; no runtime backend exists. Errors in
missing/corrupted files are shown on-screen with a reproduction command.
The default view selects **all** historical valid purchase dates, has no seller,
customer or category filter, and initially uses **dark** mode. Light/dark choice
is persisted in localStorage; filter selection does not reset when toggling.

Verify manually at ~1440px and ~390px, including mobile date inputs, theme
contrast, keyboard tab navigation, reset/clear chips, and a no-results filter
combination. `docs/WU02_HANDOFF.md` records actual execution evidence and
remaining local acceptance checks.

**Lockfile:** Commit the locally generated `package-lock.json` whenever dependencies change. Do not commit `node_modules`, `dist`, or `public/data`.

## WU-03 — linked D3 geographic and delivery visualizations

WU-03 replaces the three visualization placeholders with interactive state geography, monthly trend context and a top-15 seller-to-customer Sankey diagram. The order explorer is added by WU-04. All charts reuse the WU-01 analytical selectors and the WU-02 `useReducer` filters.

After merging the WU-03 update into the existing repository (do not replace the repository directory or delete local `public/data/`), install the new D3/TopoJSON dependencies, update the lockfile, and validate:

```powershell
npm install
npm run typecheck
npm test
npm run test:node
npm run build
npm run dev
```

Open `http://127.0.0.1:5173/` in a browser, and test both light/dark modes and desktop/mobile widths. The map requires the committed `public/geo/brazil-states.topojson` (27 UF geometries, `objects.estados`) and its MIT notice. **Regenerate it using the corrected WU-03 geography script even if the old file already exists:** run `python scripts/prepare_geo.py` from the repository root. The previous converter wrote the wrong TopoJSON ring nesting despite its own validation passing. The corrected geometry will have a new SHA-256 and must replace the previously committed asset together with its MIT notice. The two full Olist JSON facts and `metadata.json` remain local and Git-ignored at `public/data/`.

**Map:** defaults to distinct seller-origin order counts, optionally switches to customer-destination counts, and retains independent seller/destination chips. Orders with multiple origin states may appear in multiple state counts. Accessible state-list buttons mirror the state map selection.

**Trend:** shows purchase-month volume or on-time rate using the **non-date-filter cohort**. All historical months remain on the X-axis even after selecting a month; active date range highlights/mutes months rather than deleting them. The date selector remains keyboard accessible and can switch directly between months.

**Sankey:** shows the top 15 `sellerState → customerState` pairs by **matching item contribution count**, not order count or physical shipment tracking. `origin:SP` and `dest:SP` are separate nodes, so same-state SP→SP flows remain. Keyboard-accessible flow buttons set both state filters atomically. The coverage percentage uses the number of mappable item records; unmappable records are disclosed separately.

WU-03 code-generation validation and remaining acceptance checks are recorded in `docs/WU03_HANDOFF.md`. **Do not assume that source compilation, browser layout or screenshots have been verified until the local tests have run.**


## WU-04 — order explorer and final local acceptance

This unit adds a client-side, one-row-per-eligible-order explorer using TanStack Table v8.
Search is case-insensitive over order IDs. Click the column headings to sort the **entire filtered set**; the table paginates at 25 rows. The browser renders only the current 25 rows, not all ~100k orders. The table updates from the same filters applied by the map, trends, and Sankey. The **View matching orders** link after the charts jumps to this section.

The explorer's **Matching item price** and **Matching freight** columns include only items satisfying the active seller/category filters. The order-detail drawer shows all original items (and clearly separated *full-order* sums), with matched items highlighted. Orders with no item rows have item count 0 and `—` monetary amounts; a valid zero monetary value renders as BRL 0.00. The drawer closes with Escape, restores focus and offers a close button.

### Installation and tests (PowerShell)

Run from the repo root on `feature/dashboard-poc` after extracting WU-04 over the existing files:

```powershell
npm install
python -m unittest discover -s tests -p "test_*.py" -v
npm run typecheck
npm test
npm run test:node
npm run build
node tests/check_olist.cjs
node tests/check_explorer.cjs
npm run preview
```

`npm install` adds `@tanstack/react-table@^8.21.3` and refreshes `package-lock.json`; this version is intentionally pinned to the established v8 API instead of upgrading to breaking v9 during the POC. `npm run preview` opens the built app (the terminal displays the URL). For live development use `npm run dev` at `http://127.0.0.1:5173/`. The source ZIP and generated records stay in Git-ignored locations; the licensed 27-state TopoJSON is committed with its MIT notice.

### Required manual P0 walkthrough

1. Load real-data KPIs and map. Confirm initial dark theme, origin map, unbounded date range and 27 states. Switch to light and reload.
2. Click SP seller origin, switch to customer destination and click RJ: verify both chips remain and table totals and row count change. Remove chips separately.
3. Set a category: table sums must include only matching items while the order details separately list full-order sums.
4. Click a trend month and another month: table and KPIs change; chart still shows the full historical axis.
5. Click a Sankey flow: both geographic filter chips and the matching order table update.
6. Search an exact order ID, sort purchase/duration/price, go forward/backward through 25-row pages; open drawer, inspect original item rows, close with Escape, and check keyboard focus restoration.
7. Verify a zero-item order (if located through exact ID from `orders.json`) shows `0` items and `—` in money columns. Apply a no-match filter: empty table without phantom orders or `NaN`.
8. Test at desktop ~1440px and mobile ~390px, including scrolling the wide table, drawer controls, both themes, focus indicators and the map/Sankey keyboard selection lists.
9. Record actual browser load/filter latency and file sizes before claiming the 500ms interactive response target has been met.

All WU-04 test results, limitations, and acceptance items must be recorded in `docs/WU04_HANDOFF.md`. **Do not consider the POC release accepted until the above manual checks and automated tests actually pass on the developer's machine.**
