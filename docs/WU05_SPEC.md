# WU-05 — Advanced Filtering and Context-Preserving Flow Focus

**Status:** Implementation prepared; local React/Vitest/build/manual acceptance pending.
**Branch:** `feature/dashboard-poc`, after the WU-04 commit.
**Scope:** Post-POC enhancement explicitly authorized by the owner. This specification supersedes earlier single-value filtering and Sankey click-to-filter behavior in the baseline docs. It does not authorize WU-06 or WU-07.

## Canonical state and actions

The source of truth is `src/domain/types.ts` and `src/app/filterReducer.ts`.

| Field | Type | Meaning |
|---|---|---|
| `sellerStates` | `readonly string[]` | Chosen seller origin UFs; empty = unrestricted |
| `customerStates` | `readonly string[]` | Chosen destination UFs; empty = unrestricted |
| `categories` | `readonly string[]` | Chosen stable product category keys; empty = unrestricted |
| `purchaseDateFrom/To` | `string \| null` | One inclusive range; null = unbounded side |
| `focusedFlow` | `{sellerState,customerState} \| null` | Additional directed item-pair drill-down, separate from global filter groups |

- **Within a group:** OR. **Across groups:** AND. A candidate item must match both the chosen seller group and the chosen category group, *on the same item*. Order-level destination/date predicates apply first; eligible orders remain distinct.
- UI shows searchable category checklist, non-searchable UFs, selected counts, checkboxes, group clear and individually removable chips. Date range stays one interval.
- `toggle_value` adds/removes one code in a group; `clear_dimension` empties one group; `focus_flow` toggles or changes a focused pair; `clear_flow_focus` clears only focus; `clear_all` resets all.
- A chosen pair that is no longer compatible with the origin or destination group is cleared automatically; changing category/date can leave a legitimate empty focused cohort, with clear-focus available.

## Calculation and chart policy

1. **Global context:** `selectCohort(index,filters)` applies global group and date filters but deliberately ignores `focusedFlow`.
2. **Focused cohort:** `selectFocusedFlowCohort(context,filters.focusedFlow)` limits matching item contributions to the exact directed pair and deduplicates order IDs. If `focusedFlow` is null it returns the global cohort.
3. **KPIs, explorer, matching freight/item value, order-detail matching items:** use focused cohort (or context if focus absent); still count each order once. Drawer full-order totals remain unchanged.
4. **Sankey:** always renders top 15 item links from global context, not focused cohort. Hover temporarily emphasizes one link; click toggles persistent focus, dimming other links and keeping their geometry. Clicking another link switches focus. Keyboard-accessible buttons mirror ribbon behavior. Coverage remains global-context coverage.
5. **Brazil map:** chart counts exclude the map's displayed geographic dimension from filters, but keep the other dimension, category and dates. That makes unselected states visible and addable. Selected UFs and focused UF are visually distinguished; map-click toggles the chosen state in its group.
6. **Trend:** full-history x-domain and global context bars stay visible. If focused, render a focused-flow overlay for counts or on-time rates, with explicit legend/tooltip labels. Date-selected months remain indicated without collapsing the axis.
7. **No routing inference:** Sankey is item-level seller-state to customer-state commercial relationship, not road/flight routes. Multi-seller order can appear in two state buckets but one national order KPI.

## User acceptance scenarios

- With zero filters, there are 99,441 distinct real Olist orders, with zero-item records preserved, and four original KPI definitions unchanged.
- Choose SP and RJ origins; order cohort is the union of orders with SP or RJ matching items, not a duplicate sum. Choose two product categories; each item must satisfy both its seller and category groups.
- Click a Sankey flow: its ribbon brightens; all other flows remain visible but faded. KPI and explorer rows narrow to that directed pair. Click it again or clear its chip: overview and KPIs return to the global multi-select cohort.
- Switch focused pair without clearing earlier selections; the global seller/destination/category chips are unchanged. If removal of the selected state makes the focus incompatible, it clears.
- Switch to destination map, add two states from the map, and independently clear one chip. The other remains. Map counts stay contextual and show counts for states that have not been selected.
- Click two different trend months while focus is active; all history remains on the chart and the corresponding focused KPI cohort updates. Clear date without clearing focus.
- Open an order with different source sellers/categories: matching-item totals change with flow and group selections, but labeled full-order totals remain constant.
- Select a combination with no eligible orders; all undefined rates are `N/A`, the order table is empty and no phantom flows appear. Test clear/reset and both themes.

## Validation gate

- `python -m unittest discover -s tests -p "test_*.py" -v`
- `npm run typecheck`
- `npm test`
- `npm run test:node` (including six WU-05 Node regressions)
- `npm run build`
- `node tests/check_olist.cjs` and `node tests/check_explorer.cjs` using local ignored full-source JSON
- Manual browser check at ~1440px and ~390px, dark and light, keyboard focus, multi-select menu, map toggle, Sankey focus and monthly trend; measure filter response.

Only if actual checks succeed should WU-05 be accepted and committed. Never commit `public/data/` or original ZIP, and do not modify `master` directly.
