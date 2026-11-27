# Operational Expansion — Phase OE-3: Seller Performance

## Scope and prerequisites

Phase OE-3 adds **Seller Performance** as the eleventh customizable dashboard section. It requires the previously supplied OE-1 data foundation and OE-2 visible panels, **including the OE-2 React regression fix**. Do not install OE-3 against an earlier WU-11 baseline. This patch is additive: no replacement of the core Olist ETL, global filter reducer, or WU-11 management component.

This is an operational evidence expansion ahead of WU-12's separate Analytical Findings / Questions & Investigations UI. It does not implement the insight engine or customer-review ingestion.

## New panel

- Seller-associated distinct order volume, matched item count, on-time numerator/denominator, median and P95 actual delivery duration, matched freight/item-value ratio.
- Volume-versus-on-time scatter shows up to 60 high-volume sellers with **at least 30 on-time-eligible orders**; the volume axis is logarithmic, and the label must say so. Lack of qualifying sellers produces an honest unavailable message.
- Local search for a seller ID or seller origin; locally sortable columns; minimum-order threshold; fixed 25-row pagination.
- Expandable detail shows single-seller and multi-seller associated order counts, five most common matched categories, five leading destination states, and single-seller handoff timing where available.
- The panel uses **global context cohort** (date, origin, destination, category), not Sankey directed-flow focus, like the corridor scorecard. Its interactions do not mutate global filters, selected flow focus, or KPIs.

## Attribution and denominator rules

- The Olist source does **not** provide independent delivery timestamps or guaranteed handoff timestamps for each seller on a multi-seller order. Therefore the on-time rate and delivery-duration values are **seller-associated order outcomes**, not attribution of fault or carrier responsibility. A multi-seller order appears once in each associated seller row; seller row order totals do not sum to unique order totals.
- All item-level money reflects **matching items only**. Missing values remain unavailable; a nonpositive item-value sum has a **null** freight ratio. Freight charge is customer-facing, not verified actual freight cost or margin.
- The `sellerPerformance` selector requires a preselected WU-05 cohort plus **all indexed items** to identify multi-seller orders even when filters hide another seller's items. Seller + category must still match the same eligible item.
- Single-seller approval-to-carrier-handoff summaries only count valid nonnegative intervals when both milestone timestamps were exported and the original order had exactly one seller. Missing or malformed timestamps are never treated as zero duration. This remains order-level association, not causation.
- The scatter suppresses low-volume rankings but the table still shows denominators so low-n rates can be interpreted cautiously.

## Workspace migration: eight → eleven and ten → eleven

- Built-in Full Dashboard contains **eleven visible sections**, including Seller Performance at the bottom.
- Saved custom eight-section layouts append Fulfillment Lifecycle, Shipping Corridor Scorecard, and Seller Performance **as hidden**.
- Saved custom ten-section layouts append only Seller Performance **as hidden**.
- Saved custom eleven-section layouts retain their complete existing order and visibility.
- The existing localStorage key and workspace `schemaVersion:1` remain unchanged. Old layouts migrate in memory; **no write occurs until explicit Save**. Missing/duplicate/partial section IDs are rejected, not silently corrected. Existing filters and chart preferences are preserved.

## Apply

Extract the OE-3 ZIP into the repository root and overwrite only included paths. It contains complete source files and tests, no Git patch, no source/derived Olist row-level data, and no new dependencies. Keep the changes uncommitted until acceptance.

### Local verification (PowerShell)

```powershell
npm run typecheck
npm test -- --maxWorkers=1 --no-file-parallelism
npm run test:node
python -m unittest discover -s tests -p 'test_*.py' -q
npm run security:static
npm run build
npm run dev
```

Target **127/127 React tests** (previous 122 plus five new seller UI tests) and **135/135 Node tests** (previous 124 plus nine seller and two migration tests), assuming the previous local baseline is unchanged. If your local checkout has further tests, use its own total. Do not treat the expected totals as verification that the tests actually ran.

## Adversarial browser acceptance

1. Open Full Dashboard and verify **11 of 11 panels visible**; Seller Performance is near the bottom. Confirm there is no console error.
2. In Seller Performance, search a seller ID or seller state, sort all numeric columns both ways, set minimum orders, and navigate pages. Verify no more than 25 body rows are mounted, including on 3,095-seller full data.
3. Inspect a seller and verify its single- versus multi-seller counts, top categories, destination breakdown, eligible on-time denominator and handoff coverage. Expanded details must not change global KPIs or filters.
4. Under the legacy export, confirm approval/handoff metrics say unavailable rather than zero. After an authorized local ETL re-export, verify valid handoff metrics appear only where both timestamps and single-seller eligibility exist.
5. Apply origin, destination, category and date filters. Confirm Seller Performance updates; compare results to Order Explorer at the order grain. Select a Sankey directed flow; verify Seller Performance still shows the **global context** instead of misrepresenting a focused subset.
6. Hide Seller Performance, refresh, show it again, reorder it across other sections, save and discard a named dashboard. Verify hidden sections unmount and no filter is lost.
7. Test a saved eight-section and ten-section custom dashboard. New sections must begin hidden; the historical layouts/filters remain untouched until explicit Save. Check exported/imported dashboard JSON as well.
8. Check dark/light modes, narrow widths, table horizontal scroll, keyboard search/sort/pagination, and empty filter results. Scatter should omit low-sample sellers.
9. Run all regressions and inspect staged files; exclude temporary installation instructions, public/data JSON and raw Olist CSVs from the commit.

## Validation performed in construction environment

The available reconstructed repository passed **128/128 Node tests** after adding OE-3, **36 Python tests passed plus one skipped**, and the source-security scan found no issues. Its current frontend dependency installation is incomplete, so full React tests, `npm run typecheck` for TSX, and Vite build remain for the owner's Windows checkout. Full-Olist data reconciliation: 99,441 orders, 112,650 matched items, 3,095 seller IDs, 0 unmapped items; the seller selector finished in approximately 323 ms in Node, not an in-browser performance guarantee.
