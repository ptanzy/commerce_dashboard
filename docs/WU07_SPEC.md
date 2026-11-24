# WU-07 — Advanced Exploration and Multi-Flow Sankey Focus

**Authorized scope:** Owner-approved extension after the WU-06 checkpoint. This spec supersedes WU-05/WU-06's single `focusedFlow` shape and existing P1 exclusions for these six features. It does not change source data, ETL output, deployment model or source license.

## 1. Selection contract

- `Filters.focusedFlows: readonly FlowPair[]` replaces `focusedFlow: FlowPair | null`. An empty array means no flow focus; one or more pairs mean an **OR of exact ordered state pairs** intersected with ALL active global dimension and date filters. Never infer a Cartesian product from the selected pairs.
- Each matching item row must match the *same* seller/category filters and **one exact** focused pair. Distinct orders are deduplicated across all matched items and focused pairs. Matching money includes only matched items, and the full-order drawer displays all original items separately.
- Normal SVG ribbon click replaces the focused set with that one pair (clicking the only selected pair clears); Ctrl/Cmd-click toggles a pair. The accessible ranked flow buttons toggle/add without modifier keys. Per-pair chips remove independently; Clear flow focus clears all.
- Sankey uses the original global-only context. All focused ribbons remain emphasized, all others faded. When the measure changes, retain a selected pair even if its ranking falls below the usual top 15; append it to the layout if its currently selected weight is positive. Expose top 15 plus pinned count and coverage. Zero-weight monetary pairs have no drawn ribbon but remain in the focused chips/KPIs. Global filters that make a focused pair impossible prune only the incompatible pairs.
- Map and Sankey stay contextual. KPI cards, timing breakdown, category leaderboard, delay distribution, order explorer, filtered CSV, and trend foreground/overlay follow the focused cohort. Active selected pairs can be saved and restored.

## 2. Category leaderboard

- Rank up to 10 categories by distinct orders (default), valid matched merchandise value, valid matched freight charged, or order-grain on-time rate. Category key is unchanged; display via `categoryLabel`.
- Different categories may legitimately count the same multi-category order, but the same order cannot be counted twice **within** a category. Item money sums only matching item contributions. Invalid/missing money does not become zero; all-invalid categories show `—`.
- On-time rate needs `isOnTimeEligible` per distinct order, with at least 30 qualifying orders for ranking. Underpowered categories appear `Low N` at the bottom. Do not claim the dataset represents Brazilian retail overall.

## 3. Delay distribution

- Use `deliveryDayDelta` (actual calendar delivery day minus promised calendar delivery day) from punctuality-eligible delivered orders. Bucket differences as ≤-10, -9..-5, -4..-1, 0, 1..3, 4..7, 8..14, and ≥15 days.
- Distinct order-grain counts; explicitly disclose undelivered/missing/invalid date differences. No forecasting or physical-route inference. This is not the purchase-to-delivery duration KPI.

## 4. Previous equal-length period

- Compare only when both purchase date bounds are set to valid inclusive calendar dates, and an equally long **immediately preceding** date interval is fully within `index.fullHistoryMin` onward.
- Reapply all non-date global filters AND any focused directed pairs to both windows. Report current and previous distinct orders, on-time rate, median and P95 durations, freight/item ratio. Rate change in percentage points; duration in days; order volume as percent relative to previous count. If a relevant denominator is unavailable, show `N/A`. Descriptive only; not causal.
- Without a complete preceding interval, show a nonmisleading explanatory empty state rather than interpolating or truncating.

## 5. CSV download

- Local client-side download of one row per **eligible dashboard order** after global filters and focused flow OR; the explorer's local text search is not included and the label must say so.
- Columns: order ID, purchase date, customer state, order status, delivery classification, delivery days, matching item count, matching item price BRL, matching freight charge BRL. No customer PII, names, seller IDs, or full-order monetary totals.
- Missing amounts exported as blank; true zero stays 0. Quote escaped strings and guard against spreadsheet formula injection. UTF-8 BOM and CRLF for compatibility. No backend and no external upload.

## 6. Local saved views

- Explicit Save new / Load / Rename / Delete controls. Persist at most 12 named configurations in browser localStorage. A configuration captures complete date, origin, destination, category and focused flow selections. Current dataset records are never stored.
- Validate schema and bounds at read time, dedupe arrays, discard incompatible focused pairs, reject invalid records, handle localStorage denial/quota gracefully. Presets are per-browser, not synchronized.

## Acceptance gates

1. `tsc -p tsconfig.node-tests.json`, Node regressions (historical plus WU-07), Python suite, TypeScript typecheck, React/Vitest, full production build, full Olist and explorer reconciliation. Distinguish current environment from local Windows validation.
2. Browser check: Ctrl/Cmd-click and list multi-focus, a selection becoming non-top-15 after measure change, chips, same-item financials and full-order detail, category modes and Low N, delay distribution, comparison dates, CSV contents, save/load/rename/delete, dark/light themes and ~390px layout.
3. No commit until full local tests and visual acceptance pass; no raw CSV/ZIP/derived `public/data` staged for GitHub.
