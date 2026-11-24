# WU-06 — Expanded Delivery Analytics

**Scope:** Owner-authorized post-POC enhancement built on WU-05. Does not implement WU-07, API, new datasets, route tracking, period comparisons, CSV export, or saved views.

## Added capabilities

1. **P95 delivery duration** is displayed as a fifth KPI using existing `Metrics.p95DeliveryDays`, R-7 interpolated over valid delivered durations. Shows N/A for empty valid duration denominator. All five KPIs follow focused-flow cohort when selected.
2. **Delivery outcome breakdown** computes mutually exclusive early, on-date, and late counts over the punctuality-eligible delivered order subset; unknown contains *all other eligible orders*, including undelivered/invalid/insufficient estimate. The colored proportion denominator is only punctuality-eligible deliveries; unknown is disclosed separately. Distinct orders must not multiply because of item rows.
3. **Map measurement selection** is local presentation state, independent of origin/destination map mode and global filter groups: distinct orders, on-time %, median delivery days. State-level computations deduplicate distinct orders, using the self-dimension-excluded map cohort from WU-05; nonselected states stay visible. Punctuality needs valid delivered duration + estimated date. Median uses valid durations even where no estimate. Both performance fills are shown neutral for fewer than 30 qualifying observations and show N in tooltip and list; zero denominator is `N/A`. Darker fill represents greater selected value (higher punctuality rate OR longer delivery duration). A seller origin can include one order shared with another seller origin; state totals must not be summed nationally. The WU-05 focused flow emphasizes the origin/destination state but does not constrain map context.
4. **State ranking** beneath the map displays top five state volumes and five lowest on-time-rate states with at least 30 punctuality-eligible deliveries. Rankings use the current map mode/context and deterministic UF tie-breaking. No low-N ranking misleadingly includes tiny cohorts.
5. **Sankey metric selection** ranks top 15 eligible directed pairs by item contributions (default), freight charged (BRL), or item price (BRL). In monetary modes, `null`/invalid item prices are excluded from the selected metric numerator and denominator, not transformed into zeros. Valid zero-amount items contribute zero weight; zero-weight edges are omitted in monetary mode because D3 has no meaningful ribbon width. The excluded invalid monetary item count is disclosed. The original count summary fields remain for compatibility. Weight denominators cover all mappable valid item contributions for the chosen measure; top-15 coverage measures the shown weight, not the share of links. A focused pair may be outside the top 15 after switching metrics: preserve focus and display the out-of-view explanation. Sankey always uses broad global cohort and never the focused cohort.

## Data constraints and regression invariants

- No extra input files or runtime API.
- Distinct-order grain for P95, outcome segmentation, state rates and median. Matching-item grain for money and Sankey flow sums.
- Only the same item may satisfy seller and category simultaneously; WU-05 OR-in-group/AND-across-group semantics unchanged.
- Global filter and focused-flow state contracts are unchanged. Map/Sankey measure switches are presentational only and must not affect KPI totals, order explorer, or other selection state.
- Freight is **customer freight charged**, not carrier operating cost or delivery route.
- `N/A` and small sample warnings are visible and truthful.

## Local gate

Run Python ETL tests, `npm run typecheck`, `npm test`, `npm run test:node` (WU-06 regressions included), `npm run build`, `node tests/check_olist.cjs`, and `node tests/check_explorer.cjs`. Manually inspect map toggles and rankings, P95, outcomes, Sankey all three measures, focus persistence and clearing, dark/light mode, and narrow view. Local browser and production build acceptance are required before commit.
