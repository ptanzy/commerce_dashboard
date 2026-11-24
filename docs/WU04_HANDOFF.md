# WU-04 Implementation Handoff — PARTIAL (awaiting local acceptance)

**Branch:** `feature/dashboard-poc` (base: committed WU-03 `94325fed29470deaa4a0fda4cc3e9d7f954dd436`)

## Changes

- `src/domain/orderExplorer.ts`: one-row-per-eligible-order view models and indexed detail lookup. Item matching is seller AND category on the **same** item. Null financial values remain null, legitimate zero remains zero. Full-order amounts cannot accidentally replace matched-item table columns.
- `src/features/orders/OrderExplorer.tsx`: TanStack v8 controlled search, full-cohort sort, 25/page, selected-order drawer with full original item records, matching highlight, focus restoration and Escape close. TanStack receives only one page to avoid instantiating 99k table row objects. Date/default order remains the WU-01 ETL order until a sort is requested.
- `src/app/App.tsx`: explorer participates in the same global cohort as KPI/map/trend/Sankey; chart section contains a link to the matching order section. No new filter store or duplicated business metrics.
- `src/styles/index.css`: dual-theme table/drawer styles, horizontal scroll on narrow widths, focus/keyboard treatment.
- `tests/ui/orders.test.tsx`: component tests for zero-item, matching vs. full-order amounts, dialog focus, exact-ID search, date sorting, 25-row paging and empty state.
- `tests/orderExplorer.node.cjs`: four dependency-free Node regression tests. The existing 12 Node analytics tests are retained.
- `tests/check_explorer.cjs`: optional full-source counts, data bytes and selector timing measurement on production JSON.
- `package.json`: add `@tanstack/react-table@^8.21.3` (v8 stable API, rather than breaking v9); `npm install` must regenerate `package-lock.json` locally.
- `README.md`: updated commands, licensing/local-only disclaimer and final P0 walkthrough.

## Validation executed in the assistant environment

- **PASS**: `tsc -p tsconfig.node-tests.json` (TypeScript domain and data/index modules compiled).
- **PASS**: `node --test tests/domain.node.cjs tests/orderExplorer.node.cjs` — **16/16 passed**, including four new WU-04 assertions.
- **PASS**: TSX syntax-only transpilation of new/modified files via installed TypeScript compiler. This does **not** establish type correctness or runtime React behavior.
- **PASS**: `python -m unittest discover -s tests -p "test_*.py" -v` — 10 passed, 1 skipped (DuckDB package unavailable).

## Not run — required local checks

- **NOT RUN:** `npm install`; package registry inaccessible from the assistant's container.
- **NOT RUN:** `npm run typecheck`, `npm test`, `npm run build`, `npm run preview`; React, TanStack and D3 dependencies unavailable in this environment.
- **NOT RUN:** production-data browser measurement, desktop/mobile inspection, focus review, theme/chart contrast checks and manual user acceptance; no UI screenshots generated or claimed.
- **NOT RUN:** full-source `node tests/check_explorer.cjs`; locally generated ignored `public/data/` is not available in this container.
- **NOT RUN:** full DuckDB pipeline integration (DuckDB unavailable); previous WU-01 verification on developer machine remains the actual evidence.

## Required Windows commands

```powershell
cd C:\Users\ptanz\job_search\commerce_dashboard
git branch
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

**Lockfile:** Include updated `package-lock.json` in the eventual commit, together with WU-04 source and tests. Keep `data/raw/`, `public/data/`, `node_modules/`, `dist/`, and `dist-test/` untracked/ignored. Never distribute raw or row-level derived Olist data without a separate rights review.

## Manual P0 acceptance (must actually be performed)

- [ ] A. Real source loads locally, all-history default, four KPIs correct, dark-first and persisted light/dark.
- [ ] B. 27-state choropleth: seller-origin SP click, destination RJ toggle, both filter chips persist, order table reconciles.
- [ ] C. Category/seller same-item semantics; matching-item prices and freight differ from full-order detail totals for multi-seller/category order.
- [ ] D. Sankey top 15, same-state flow, click sets pair; order table updates.
- [ ] E. Trend full-history context; click two different months; table and KPIs update.
- [ ] F. Order explorer: search exact ID, sort purchase/duration/freight, paginate 25, open detail, inspect seller states and full/matching sums, close Escape and recover focus. Zero-item amount `—` vs. known BRL zero.
- [ ] G. Empty cohort: no phantom rows, no `NaN`, filter reset works.
- [ ] H. At ~1440px and ~390px: table horizontal scroll, drawer usability, keyboard navigation, contrast in both themes, accessible map/Sankey alternatives.
- [ ] Performance: actual browser parsing/filter responsiveness and generated data bytes recorded. Target interaction ≤500ms; if missed, document instead of claiming pass.
- [ ] Production build and Vite preview display real-data dashboard without missing assets or console errors.

## Status and risks

**PARTIAL**, awaiting developer-machine npm dependency installation and full React/build/manual P0 acceptance. Existing WU-03 branch is read/verified; no remote GitHub write was attempted in this unit (previous GitHub write denied with 403). No WU-05 or post-POC feature is authorized. Stop at this WU-04 gate and record test results accurately.
