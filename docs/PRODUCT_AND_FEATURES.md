# Product and Feature Requirements — POC v2

> WU-05 adds post-POC multi-select dimensions and context-preserving Sankey focus. Its interactive behavior is specified in `docs/WU05_SPEC.md` and supersedes the original P0 single-select/click-to-filter wording below; the baseline POC feature list is retained for historical acceptance context.


## Goal

A portfolio-grade **historical** Brazilian e-commerce delivery intelligence dashboard, implemented as a locally running static SPA, showcasing trustworthy mixed-grain analytics, linked React+D3 visualizations and drill-through into Olist orders. It is **not** a carrier tracking platform or a complete Brazilian retail market sample.

Primary user question: **Which seller-origin and customer-destination areas have the greatest volume, how reliable are deliveries, how much freight is charged, and which historical orders support those views?**

## Locked product decisions

- **Local-only** run and Vite build/preview. No Pages deploy, cloud service or runtime backend.
- **Dark and light modes**, dark on first visit, user-toggle with local persistence; visuals legible in both.
- **Seller-origin** map on initial load, destination alternative; origin selection filters orders by existence of matching seller items.
- **All historical valid purchase dates** selected by default (date filters unbounded). No implied live records.
- Source Olist ZIP stored local/Git-ignored. Run data profiling before ETL; verified, attributed Brazil TopoJSON.

## P0 — required in a completed POC

1. Responsive header with source/year caveat, theme toggle, date/destination/origin/category filters, individual filter chips and reset.
2. Four numerically correct KPIs: distinct order count, on-time rate with valid denominator, median purchase-to-delivery days, freight charges ÷ matched item price. `N/A` for zero denominators.
3. Brazil state-level D3 choropleth (default origin, destination toggle) with click-to-filter and accessible action list.
4. D3 monthly trend (purchase count / on-time toggle), with **stable full-history X-domain**, month-click date selection and sparse/partial-month indicators.
5. D3 Sankey **top 15** directed seller-state → customer-state **item contribution counts**, including same-state links, displayed-share label; click sets state pair.
6. TanStack Table with search, sort, pagination and order-detail view. **Matching-item** freight/value columns clearly distinguished from full-order detail totals.
7. Coordinated filters and drill-through; item/category/seller filters use shared cohorts, never inflate distinct orders.
8. English category labels from translation file with deterministic fallback, accurate BRL display, loading/empty/error states and attribution.
9. Documented data profile, provenance/rights decision, deterministic Python/DuckDB ETL, Vitest/RTL tests, Python assertions, successful local build and manual acceptance.

## P1 — optional only after P0 passes

- Previous equal-length period KPI comparisons; P95 duration visual and early/on-time/late distribution.
- Sankey weight toggles: matching freight charges or item price; only after semantics/tests are defined.
- Choropleth alternative measures (on-time %, median days) with low-N warnings.
- Refined micro-animations, drag brushing, richer mobile alternatives and advanced drill-down.

## P2 / explicitly excluded

GPS routes, carriers, vehicle fleets, shipment tracking, inventory, payments, review sentiment, forecasting, live data, auth, SQL server, hosted API, production operations, GitHub Pages and Playwright as a required acceptance gate.

## User stories / acceptance scenarios

| ID | Demonstration | Invariant |
|---|---|---|
| US-01 | Load local dashboard | Full historical date extent, source disclosure, dark-first, correct P0 KPIs |
| US-02 | Click origin SP | All other components use eligible distinct orders, matching items only |
| US-03 | Switch to destination map and click RJ | Both origin and destination chips visible; AND filtering; no silent reset |
| US-04 | Filter translated category | One order counted once; charges only from matching seller/category items |
| US-05 | Click Sankey SP→SP or SP→RJ | Same-state links work; `set_flow_pair` updates both filters atomically |
| US-06 | Click March 2018 | KPI cohort updates; trend retains other months with muted styling; click another month directly |
| US-07 | Search/inspect order | One row per order; matching amounts differ from labeled full-order detail amounts when applicable |
| US-08 | Clear a filter/no matches | All components reconcile; empty state and `N/A` rather than `NaN` |
| US-09 | Toggle theme and reload | Dark/light persist without losing current data filters during toggle |

### Feature-to-data support

Order/delivery dates and statuses are in `olist_orders_dataset.csv`; items and freight charges in `olist_order_items_dataset.csv`; seller states in `olist_sellers_dataset.csv`; customer states in `olist_customers_dataset.csv`; categories/translations in products and category translation CSVs. No carrier, actual road routes or customer shipment GPS. Revenue and true shipping operating costs must not be inferred from `freight_value`.

## WU-07 owner-authorized extension (supersedes P1 deferments)

Adds Sankey **multi-flow exact-pair focus**, a product-category leaderboard, delivery-day histogram, previous equal-length period comparison, filtered-order CSV download, and named local saved filter views. The original historical noncommercial/local-only product constraint, no-PII export and all mixed-grain accounting invariants remain in force. Canonical extension requirements: `docs/WU07_SPEC.md`.
