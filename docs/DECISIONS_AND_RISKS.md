# Architecture Decisions, Risks and Open Questions

## Decision register

| ID | Decision | Why | Status |
|---|---|---|---|
| ADR-01 | React + TypeScript + Vite | Clear app engineering showcase with low setup | Accepted for POC |
| ADR-02 | D3-based SVG visualizations | Custom chart and interaction skills; manageable at state-level scale | Accepted |
| ADR-03 | Static offline-prepared analytical data | No API server or database runtime | Accepted |
| ADR-04 | Python + DuckDB if joins are easier; Pandas is permitted | Flexible, readable deterministic ETL | Provisional pending data profile |
| ADR-05 | One React-owned canonical filter state and selectors | Avoid conflicting metrics across charts | Accepted |
| ADR-06 | Distinct order facts separate from item contribution facts | Prevents cardinality errors; supports category filtering | Accepted |
| ADR-07 | Use D3 Geo with licensed TopoJSON for 27 Brazilian states | Small geography; no expensive map stack | Accepted pending source selection |
| ADR-08 | TanStack Table for order explorer | Avoid building sorting/pagination from scratch | Accepted |
| ADR-09 | GitHub Pages project deployment | Cheap, no server, reproducible | Accepted |
| ADR-10 | No carrier/GPS/physical-route claims | Source doesn't support these attributes | Non-negotiable |
| ADR-11 | Use on-time delivered-on-or-before estimated calendar **date** | Avoid midnight cutoff misclassification | Accepted |
| ADR-12 | Treat source timestamps as source-local; document parsing | Avoid misleading viewer-timezone date shifts | Accepted |
| ADR-13 | Prioritize P0 linked dashboard workflow over extra charts | Two-day target | Accepted |

## Project risks

| Risk | Impact | Mitigation |
|---|---|---|
| Olist license/public redistribution unclear | Cannot put full derived records on public Pages | Review source terms; use separately licensed demo fixture if necessary; permit locally generated private full data |
| Too many source joins / repeated geolocation rows | Wrong counts and huge exports | Profile keys, make geo prefix lookup unique, assert reconciliation |
| Orders contain several sellers/categories | KPI vs flow count conflict | Separate order and item grain; define explicit filter semantics and fixtures |
| CSV timestamp quality and date-only promises | Wrong on-time and duration math | Normalize source-local timestamps; compare calendar dates for punctuality; report exclusions |
| Map shapes/state codes not aligned | Incorrect choropleth | Validate 27-state identifier mapping, topology licensing, geographic summary totals |
| Sankey visual clutter | Unreadable chart, performance problems | Top-N states/links, aggregate and state visible share |
| Large JSON payload in Pages | Slow first paint or memory growth | Compact exports, lazy-load detail, compress; profile before optimization |
| Data source is historical | False real-time framing | Display years and historical attribution at all times |
| Freight value misread as carrier expense | Misleading financial narrative | Label as "freight charges"; define numerator/denominator explicitly |
| Ambitious extras crowd out P0 | Missed two-day goal | P0/P1/P2 prioritization, hard stop on optional features |
| GitHub Pages base path | Missing static assets on deploy | Explicit `/commerce_dashboard/` base and deployment smoke test |

## Open implementation questions (not blockers for documenting architecture)

1. Are the exact seven CSVs available and sufficiently intact to run the whole analysis?
2. Which Brazil-state TopoJSON file is properly licensed for redistribution?
3. May the full transformed Olist rows legally be published from GitHub Pages, or should the hosted demo use a licensed compact fixture?
4. How large are compact order/item exports, and should the order details lazy-load?
5. What explicit business rule should apply to records with status `delivered` but an inconsistent or missing actual date? Proposed: exclude from duration/accuracy; report.
6. Should the category filter permit multiple selected categories? **POC decision: one category at a time**; multi-select deferred.
7. How should month selection interact with the global date range? **POC decision: replace active purchase-date range**, with a visible clear control.

## Research influences (patterns, not code dependencies)

- [AfterShip](https://www.aftership.com/) — delivery performance, distribution and percentiles.
- [ShipStation](https://www.shipstation.com/) — freight/shipping charge breakdowns.
- [Shopify Analytics](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports) — KPI-first hierarchy, comparisons, drill-down navigation.
- [Metabase](https://www.metabase.com/docs/latest/dashboards/introduction) — filter interactions and exploration of underlying records.
- [Observable Framework](https://observablehq.com/framework/) — build-time data preparation and static data-driven sites.
- [D3 documentation](https://d3js.org/) — data-driven charts and React-compatible functional scales/layouts.
- [TanStack Table](https://tanstack.com/table/latest) — headless table state and sorting.
- [Olist Kaggle source](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce) — original historical dataset.

All brand examples are functional inspiration; no proprietary visual assets, source code or undocumented architecture claims are required.
