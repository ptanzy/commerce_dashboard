# Architecture Decisions, Risks and Open Questions — revised after independent review

## Accepted decisions

| ID | Decision | Rationale |
|---|---|---|
| ADR-01 | React + TypeScript + Vite static local SPA | Modern implementation, no backend |
| ADR-02 | D3 layouts/scales with React-owned SVG | Strong interactive showcase, testable lifecycle |
| ADR-03 | Python + **DuckDB only** for P0 ETL | Consistent SQL transforms and minimal dependencies |
| ADR-04 | Explicit separate order/item grains and single metric engine | Prevent duplication and mixed-grain errors |
| ADR-05 | WU-05: one `useReducer` with multi-select groups plus independent `focusedFlow`; earlier `set_flow_pair` retired | OR within groups, AND across groups, with context-preserving Sankey drill-down |
| ADR-06 | 27-state TopoJSON + `d3-geo` | Correct complexity for state-level map |
| ADR-07 | **Skip Olist geolocation CSV for P0** | ZIP has state codes in seller/customer tables; avoid huge unnecessary join |
| ADR-08 | Compact `orders.json`, `items.json`, `metadata.json`; no `geo-flows.json` | Live client cross-filtering needs record-grain data |
| ADR-09 | TanStack Table | Reliable search/sort/pagination without bespoke framework |
| ADR-10 | Two themes, dark default, token-based CSS/localStorage | Small incremental complexity, stronger UX |
| ADR-11 | Seller origins default, destination toggle; full historical date default | User requirements |
| ADR-12 | Local dev and preview only, Vite base `/` | Avoid deployment configuration |
| ADR-13 | Date comparison is **source calendar date**, not timestamp at midnight | Correct punctuality semantics |
| ADR-14 | R-7 percentile on fractional elapsed days, display one decimal | Determinism across implementations |
| ADR-15 | Trend X-domain fixed to all history; month selection highlights instead of collapsing | Keep navigation usable |
| ADR-16 | Sankey P0 uses **top 15 directed links weighted by item count**, same-state flows retained | Readability and additive semantics |
| ADR-17 | Theme/responsive checks while building charts; Playwright P1 | Avoid end-loaded QA and tool setup |
| ADR-18 | Five bounded baseline WUs, WU-00 through WU-04 | Smaller assignments, unchanged original scope |
| ADR-19 | WU-05 is a post-POC enhancement, not a silent rewrite of the baseline release | Source filters and Sankey behavior superseded as recorded in `WU05_SPEC.md` |

## Main risk register

| Risk | Consequence | Mitigation / owner |
|---|---|---|
| Business dataset publication | Public Git history may violate redistribution conditions | Olist Kaggle currently labels CC BY-NC-SA 4.0; keep original and derived row-level data Git-ignored pending explicit distribution review |
| Brazil topology license/ID mismatches | Missing state or incorrect map results | WU-00 pin actual file URL/version, inspect 27 features and 2-letter UF mapping; record provenance |
| Mixed item/order grain | Wrong totals and mismatched table/KPIs | Dedicated eligibleOrderIds/eligibleItems selectors; deterministic multi-seller tests |
| Incoherent dates | Distorted on-time and durations | Force unknown and exclude from denominators; show data quality counts |
| Large browser payload | Slow initial load, GC pressure | Measure real sizes and query timings before optimization |
| Selected month hides other months | Broken user navigation | Fixed full-history trend domain + highlighted selected interval |
| Two themes increase contrast problems | Unreadable legends and charts | Semantic tokens and per-chart dark/light review in WU-03 |
| Big WUs expand beyond two days | Missed POC timeline | Small 5-WU plan and strict P0/P1 separation |
| Olist lacks GPS/carrier identity | Misleading geographic claims | Label commerce origin→destination relationships, not actual routes |

## Geographic source candidates (not yet approved)

- [Brazilian States TopoJSON gist](https://gist.github.com/ppKrauss/0c33364240e841fa23e78b21005f792c): appears to use 2-letter UF `id` for 27 regions. **License/attribution must be confirmed at WU-00; do not imply automatically cleared for use.**
- [topojson-brasil](https://github.com/marcelodeandrade/topojson-brasil): alternate topology; may use **numeric IBGE UF codes**, requiring an explicit code-to-two-letter-UF map. Confirm repository asset scope and license before adoption.

Choose exactly one source at WU-00 and save `sourceURL`, version/commit, license evidence, feature identifier mapping and checksum to `docs/DATA_PROVENANCE.md`.

## Unresolved items to verify, not permission for feature expansion

1. Actual local Olist ZIP file inventory, input exceptions, valid join counts, invalid dates, untranslated categories.
2. True compressed/uncompressed output sizes and selector latency (no measured evidence yet).
3. Actual topology rights and mapping; must have 27 shapes/unique codes.
4. Whether customer-facing published Olist-derived assets are approved; **local-only POC may proceed with ignored outputs**, but public redistribution requires its own approval.
5. Any data-source anomalies that demand explicit exclusion rules; record them in `DATA_PROFILE.md` before modifying the canonical contract.

## Research influences (no proprietary code reuse)

- [Olist Kaggle dataset and license](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce) — historical records, CC BY-NC-SA 4.0 listing.
- [AfterShip](https://www.aftership.com/) — delivery performance/percentile information hierarchy.
- [ShipStation](https://www.shipstation.com/) — freight charge breakdowns (not carrier operating costs).
- [Shopify Analytics](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports) — KPI-first dashboard structure.
- [Metabase](https://www.metabase.com/docs/latest/dashboards/introduction) — cross-filter and drill-through conventions.
- [Observable Framework](https://observablehq.com/framework/) — build-time transforms for static sites.
- [D3](https://d3js.org/) and [TanStack Table](https://tanstack.com/table/latest) — implemented interaction libraries.

| ADR-07 | WU-07: `focusedFlows` is an exact directed pair set, not Cartesian origin/destination selections; local CSV and presets only | Avoids false cross-pair orders; preserves source data ownership and local-only constraints. New risk: large client-side CSV exports and browser storage failure, disclosed and handled. |
