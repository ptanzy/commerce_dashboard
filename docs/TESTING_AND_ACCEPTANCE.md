# Testing Strategy and Acceptance Criteria

## 1. Principle

Trustworthy numbers and coordinated interactions are more important than animation and pixel-perfect polish. Test **data invariants first**, then dashboard behavior, then visual presentation.

## 2. Testing layers

| Level | Tools | Focus |
|---|---|---|
| ETL validation | Python assertions + DuckDB SQL or pytest | Source schema, joins, row counts, nulls, geographic IDs, idempotence |
| Metric unit tests | Vitest | Distinct orders, denominators, inclusive delivery dates, percentiles, freight totals |
| Selector tests | Vitest with fixture records | Category/seller/date cross-filter semantics, order vs item grain |
| React component tests | React Testing Library | Filter chips, reset, table search/sort, empty states, keyboard controls |
| Integration smoke | Playwright if feasible; otherwise manual documented script | Cross-chart filter interaction, tooltip/selection, order drill-through |
| Build/deployment | `tsc`, Vite build, Pages preview | Public base path, assets, static export and route behavior |

## 3. Required deterministic test fixtures

Use a small crafted fixture with >= 6 orders spanning multiple states, categories, sellers, months, statuses and dates. Include these situations:

1. **Multi-seller:** one order, three items, two sellers, two product categories.
2. **On deadline:** a delivered order has delivery timestamp later in the day than estimated delivery timestamp stored at midnight, but both occur on the same calendar date. Must count **on time**.
3. **Late:** actual delivery calendar date is later than estimated date; classification late.
4. **Missing actual:** canceled or pending order with no customer delivery date; excluded from on-time denominator and delivery-duration percentile, still counted in total orders if cohort includes it.
5. **Missing category:** product/category translation is absent; explicit `Unknown`/raw-category fallback, no crash.
6. **Invalid amount/zero price:** ETL reports invalid numeric values and freight ratio remains `N/A` for a zero-denominator cohort.
7. **No matching filters:** zero orders, zero flows, safe `N/A` rates and a meaningful empty-state message.
8. **Geolocation duplicates:** many prefix rows do not multiply order or item records.

## 4. Data correctness invariants

- [ ] `orders.json` has one row per `orderId`.
- [ ] `items.json` is unique on (`orderId`, `orderItemId`).
- [ ] Every exported item joins to an exported or deliberately accounted-for order; unmatched refs reported.
- [ ] Order totals aren't inflated by item or geolocation joins.
- [ ] For each order, item-level price/freight sum reconciles with order-level amounts under documented exclusion rules.
- [ ] Delivered eligible count <= distinct total orders.
- [ ] On-time count <= delivered orders with valid estimate and delivery date.
- [ ] Median and P95 only use nonnegative valid durations.
- [ ] Every known state code maps to a recognized Brazil state, or is reported as unknown.
- [ ] Sankey item/link total reconciles to the eligible matching item contributions **before visual top-N suppression**.
- [ ] No aggregation sums per-bucket distinct order counts across overlapping seller/category buckets as globally distinct orders.
- [ ] Re-running ETL on identical inputs produces identical content values (ignoring separately declared generation timestamp).
- [ ] Publicly published datasets comply with source licensing and minimize unnecessary source fields.

## 5. P0 integration acceptance walkthrough

**A. Default state**
- Open locally and on production static URL. Dashboard shows historical dataset title, correct date extent, four KPIs, Brazil map, trend, Sankey and order table. All legends and units are visible.

**B. Destination selection**
- Click state `SP` on map. `SP` destination chip appears. KPI order count equals distinct order rows whose customer state is SP. Trend, flow graph and order table update. Clicking SP again or clearing its chip restores prior selection.

**C. Category selection**
- Choose translated English category. KPI order count equals distinct orders with >= 1 matching item. Freight ratio uses only matching item charges and item prices. Table displays distinct orders without duplicate IDs.

**D. Sankey link selection**
- Click an origin->destination connection. Both selected state constraints become visible. Order table shows orders having matching item links; other charts agree with same cohort. Clear selection returns to previous relevant state.

**E. Date filtering**
- Restrict purchase-date range. Monthly buckets and KPIs reflect purchases in range. Range boundaries are inclusive at calendar-day granularity. Invalid range is rejected or prevented.

**F. Order exploration**
- Search order ID, sort by duration, paginate, select a row. Detail shows original timestamps, categories, sellers and freight charge totals; items highlight matching category when active.

**G. Missing/no data**
- Apply impossible/empty cohort. All charts show appropriate empty states, financial ratio/on-time/median show `N/A` rather than `0%`/`NaN`, and clear filters works.

**H. Compatibility and accessibility**
- At desktop ~1440px and phone ~390px, content is readable and controls remain operable. Tab navigation reaches filters/table and visible chart equivalents. Chart color legends and tooltip data aren't color-only.

## 6. Performance gates (POC targets, measured on representative developer hardware)

- [ ] Production assets load without failed HTTP requests or CORS errors.
- [ ] 100k-order scale (or documented full available sample) loads without crashing or locking the tab.
- [ ] A filter change visibly responds in approximately <= 500 ms on typical desktop hardware after initial load; investigate and document if slower. This is a **target**, not a preexisting measurement.
- [ ] No significant permanent heap growth after repeated select/clear cycles.
- [ ] Sankey defaults to a readable bounded set of links and shows how much of eligible flow is displayed.

Capture measured file sizes and timings in implementation notes; do not present estimates as verified performance.

## 7. Release gate checklist

**Required to claim completed POC:**

- [ ] Source-profile report created and data licensing decision documented.
- [ ] Data ETL test and reconciliation assertions pass.
- [ ] Unit tests for metrics and selectors pass.
- [ ] Representative end-to-end P0 walkthrough passes.
- [ ] Type-check, lint, and production build succeed.
- [ ] Dashboard states no actual routes/carriers are tracked.
- [ ] GitHub Pages deploy serves all static assets correctly.
- [ ] README documents exact acquisition, transformation, build and hosting commands.

**Optional, non-blocking:** Animated transitions, advanced brushing, previous-period comparisons, percentile overlays, exhaustive automated visual regression tests.
