# Testing and Acceptance — canonical POC v2

## Principles

The test priority is **correct data grain + coherent filters + useful visualizations**, then responsive styling. Tests and claims must be reproducible. Never call a WU accepted because source exists; the agent must record actual executed commands/results.

## Tools and levels

| Layer | P0 method | Purpose |
|---|---|---|
| Offline data | DuckDB/Python assertions; pytest optional | Keys, joins, source profiling, invariant totals, deterministic export |
| Metrics/selectors | Vitest | Order distinctness, item matches, percentiles, calendar-date punctuality |
| UI components | React Testing Library + Vitest | Filter reducer, chips, theme, table behavior, empty states |
| Integrated UI | Structured **manual** walkthrough | Linked map/trend/Sankey/order details, desktop/mobile and keyboard |
| Build | `tsc --noEmit` or project `typecheck`, `npm run build`, Vite preview | Runtime assets and type correctness |

**Playwright not a P0 dependency.** Do not install browser binaries without need or approval. Report which manual tests were actually performed and whether screenshot inspection occurred.

## Deterministic test fixture requirements

Create at least 8 synthetic test orders covering:

1. Order with three items across two seller states and two categories, and a single customer state.
2. Delivered at noon on estimated delivery calendar date (estimated at midnight): on time.
3. Actual delivered date before promise date: early; after promise date: late.
4. `delivered` status with actual date before purchase: `deliveryDays=null`, `deliveryDayDelta=null`, `classification='unknown'`, excluded from punctuality denominator.
5. Canceled/pending and missing actual delivery: counted as purchased if valid date, excluded from delivery metrics.
6. Zero items: order row remains when no item filters; disappears under seller/category constraint; amount columns show `—`.
7. Missing category translation: stable fallback key and readable English label; category IDs not coupled to display labels.
8. Null/invalid amount and zero price denominator, empty cohort; show `N/A` not false zero rate.
9. Same-state item flow (`origin:SP → dest:SP`) and cross-state links: both valid, never a self-loop collapse.
10. Two months and a month-selection switch: month-click updates global date cohort but trend still displays full-history domain/context.

## Data correctness invariants

- [ ] One `OrderFact` per distinct `orderId`; unique (`orderId`, `orderItemId`) for items.
- [ ] Every item joins to a known order or appears in an explicitly counted unmatched-exclusion report.
- [ ] No accidental order duplication due to item joins; Olist geolocation **not** joined.
- [ ] Valid date range inclusive by source calendar day; default unbounded includes all **valid purchase-date** orders.
- [ ] Delivered before purchase produces unknown class and is excluded from on-time and percentile measures.
- [ ] Same-day delivery compared to estimated calendar date is on-time; exact time of day irrelevant for punctuality.
- [ ] R-7 median/P95 over fractional nonnegative days, rounded only for UI.
- [ ] Correct AND semantics for seller and category **on the same item**, not existence of separate unrelated items within an order.
- [ ] Matching item price/freight sums in KPI and Order Explorer agree; full-order values in drawer labeled separately.
- [ ] Zero-item order appears in order KPI without item filters and displays `—` monetary columns; no Sankey contribution.
- [ ] On-time numerator ≤ eligible on-time denominator ≤ delivered valid cohort ≤ distinct order cohort.
- [ ] Sankey all-link total reconciles to mappable eligible item rows; top 15 subset displays correct coverage; unmappable count disclosed.
- [ ] For an origin state, distinct order count may overlap with other origins; national distinct order KPI never adds state totals.
- [ ] `brazil-states.topojson`: 27 unique state shapes/codes; all known seller/customer UF codes map or are reported.
- [ ] Re-running ETL over unchanged inputs creates identical order/item data values; source checksum/processing version recorded.

## Manual P0 acceptance walkthrough

**A. Startup** — Confirm local data/metadata and build preview load without asset errors. Dark first visit; all valid historical purchase months accessible; seller-origin map selected; four KPI cards show actual values. Tooltips explain denominators.

**B. Map** — Click origin SP: seller-state chip visible and all KPIs, table, Sankey change. Toggle destination then click RJ: BOTH chips persist, AND logic applies, independent chip clear works. Screen-reader-friendly state list provides equivalent selections.

**C. Category and mixed grain** — Choose a translated English category. Distinct order count matches correct cohort, item ratio uses only matched seller/category items. Table shows per-order matching sums; drawer displays full-order totals separately.

**D. Sankey** — The diagram shows at most 15 directed links, coverage share, same-state SP→SP where present, and separately namespaced origin/dest nodes. Clicking SP→RJ sets both filters in one reducer action; chart/table reconcile.

**E. Monthly trend** — Click a month, see KPIs filtered to month while chart retains all months and highlights selected month; click a different month without clearing first; clear restores all. Empty/low-N months are labeled accurately.

**F. Order explorer** — Search exact order ID, sort date and duration, paginate, open detail with source dates/item seller states and matching-vs-full totals. A zero-item order displays 0 items and `—` price/freight.

**G. Empty/missing** — Use a filter combination yielding no orders. Show clear empty state, `N/A` for undefined rates; no errors, stale chart marks, `NaN`, or phantom paths. Clear/reset works.

**H. Themes/responsive/a11y** — Toggle dark↔light and reload; theme persists, cohort unchanged. Test controls at ~1440px and ~390px widths, map/Sankey accessible equivalents, readable tooltips, SVG labels, keyboard focus and contrast. Verify reduced-motion behavior if transitions are used.

## Performance measurement, not unverified guarantee

- Measure actual exported order/item file bytes, JSON parsing/initial load and filter-change responsiveness with representative full Olist data.
- **Target** visible filter response ≤500ms on developer desktop after initial load. This is a target, not an already measured result; document actual results and investigate failure before adding complexity.
- Table must not render 100k DOM rows (paginate 25 rows); Sankey at most 15 links; map at most 27 regions.
- Repeated selection/clear cycles should not cause unbounded memory growth or stale state.
- If full facts exceed workable browser limits, capture numbers and present focused optimization recommendation; don't silently replace real data with undisclosed samples.

## Release gate

- [ ] WU-00 profile and provenance reports complete; rights/attribution decisions documented.
- [ ] WU-01 reconciled ETL outputs and metric/selector tests pass.
- [ ] WU-02 theme, shared state and KPI interaction tests pass.
- [ ] WU-03 chart interaction, state topology and dual-theme review pass.
- [ ] WU-04 explorer, drill-through, local smoke, responsive and keyboard walkthrough pass.
- [ ] Actual commands/results, known issues and failed/not-run tests documented.
- [ ] Local dev + build/preview work; no public hosting claim.
- [ ] README accurately documents download/ZIP placement, ETL and runtime commands; public Git ignore restrictions still respected.
