# Operational Analytics Expansion — Fulfillment Lifecycle and Shipping Corridor Scorecard

**Status:** Phase OE-1 domain/ETL foundation and Phase OE-2 visual integration implemented. The separate WU-12 Analytical Findings & Investigations engine remains a later phase.

## Why this work is being done first

WU-11 already supplies a mature customizable eight-section dashboard. Before wiring the WU-12 analytical interpretation engine, we are broadening the operational evidence available for investigations. Two high-impact capabilities were selected:

1. **Fulfillment Lifecycle:** purchase → approval → carrier handoff → delivered customer; stage-level median and P95, coverage and missing/invalid events. The previous exports only had purchase and delivery timestamps, so ETL enrichment is necessary for complete stages.
2. **Shipping Corridor Scorecard:** full origin→destination table/matrix with distinct orders, item counts, on-time rate, median/P95 delivery days, and customer freight charge as a proportion of matched item value. Unlike Sankey top-15 links, the scorecard includes *all* mappable directed state pairs.

## OE-1 delivered contracts

- `shippingCorridorScorecard(cohort, options)` operates on a **preselected cohort**. It does not independently select or mutate filters, so WU-05/06/07 semantics remain authoritative. For a global context scorecard, use `selectCohort(index, filters)`; do not automatically apply `filters.focusedFlows` as this would alter the Sankey overview meaning. Only apply the focus in a specifically labeled drill-down.
- Seller and category filters must match the **same item**, as defined by `selectCohort`. Monetary amounts include only matching valid item rows, not a whole-order duplicate. If no valid price or no positive price is present, freight-to-price is **null**, never infinity/zero. Item count and BRL values remain at matching-item grain.
- Distinct order count is unique **per corridor**. An order with sellers in multiple origin states can contribute to more than one corridor; corridor distinct-order totals are therefore non-additive across rows. Exact direction and same-state corridors are retained. Missing seller/customer state items are counted as unmappable.
- On-time is determined by canonical `isOnTimeEligible` and classification. Unknown outcomes remain in distinct-order counts but are excluded from the on-time denominator. Delivered-duration medians and P95 exclude missing, invalid, non-delivered or negative durations and use the existing R-7 quantile.
- `fulfillmentLifecycle(cohort)` counts stages at **order grain**, not item grain. Stages are determined from source-naive purchase/approval/carrier/delivered timestamps. Missing and malformed event timestamps never imply a zero-duration stage. Impossible negative intervals are excluded and counted.
- ETL extends `scripts/prepare_data.py` to *optionally* export normalized `approvedTimestamp` and `carrierHandoffTimestamp` when source columns exist. The export tracks bad timestamps separately in `invalidCounts` and changes `processingVersion`, but retains `schemaVersion: 2` and the unchanged six-CSV/no-PII scope.
- Legacy WU-11 exports without milestone fields continue to validate and work. Lifecycle should explicitly say the approval/handoff source fields are **not in this export**, instead of showing a 0-day stage. Re-exporting from the authorized local Olist CSV/ZIP is required for those stages. No source or derived row-level data belongs in Git.

## UI integration (OE-2 implementation)

**Shipping Corridor Scorecard:** sortable, searchable table of directed state corridors; on-time rate and its eligible n, median/P95 and their eligible n, matched freight/value ratio, sample-size indicator, and drill-through into existing exact directed-flow filtering. Responsive table with controlled pagination; no 417-row DOM mount. Tie into Sankey and map without changing what their existing metrics mean.

**Fulfillment Lifecycle:** stage-duration visualization with median and P95, visible denominators/coverage per stage and explicit unavailable-state messaging. A sample/coverage warning is required for incomplete events, and the chart must not conflate promised-date error with actual transit time.

**Integration:** The registered layout revision expands from eight to ten IDs. Old eight-ID named dashboard layouts migrate in memory to ten IDs by appending both new IDs as **hidden**, retaining the exact prior order/hidden settings, filters, chart preferences and active dashboard. The Full Dashboard includes both visible by default. Revision detection is based on the complete validated ID set (eight historical IDs vs ten expanded IDs); the established workspace schemaVersion 1 and localStorage key are unchanged. No write occurs during loading; a later explicit Save persists the normalized layout. Unrecognized/partial layouts are rejected. Filters remain independent, hidden panels unmount, and both panels retain error boundaries and responsive styles.

## Later operational expansion

- Seller Performance (seller-specific handoff timing and multi-seller attribution safeguards)
- Customer Experience (requires privacy-preserving local review-data ingestion)
- Existing-panel improvements: delivery promise accuracy, matched product dimensions, side-by-side cohort comparison.

## Release gates

OE-1 gate: targeted TypeScript check, Node selectors, Python ETL unit tests, full historical JSON reconciliation; owner-run complete local React/Node/Python/build suite. These files do not change the dashboard UI.

OE-2 gate: new section registry migration tests, saved-workspace round trips with historical data, full-data responsiveness, filter/focus scope, browser accessibility, empty states, both themes, hidden-chart unmount, and final release review.
