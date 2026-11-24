# Visualization and UX Specification — canonical POC v2

## Information hierarchy

One responsive page answering: **How are deliveries performing? → Where do seller-origin and customer-destination patterns differ? → Which commodity flows contribute? → Which orders explain them?** Historical data only; no real-time tracking claim.

Desktop wireframe (~1440px):

```text
Delivery Intelligence                     [Data source] [Dark / Light]
[Purchase range] [Customer state] [Seller state] [Category] [Reset]
[Active chips: Origin SP ×] [Category Health Beauty ×]
[Distinct orders] [On-time rate] [Median duration] [Freight/price]
[Brazil states — Seller origins/Destinations] [Monthly order / punctuality trend]
[Sankey: top 15 directed item-contribution flows, displayed share]
[Order explorer: search, sort, 25/page]  [selected order details]
```

Tablet: stacked primary charts, 2-column cards. Phone (~390px): one-column layout, chart responsive width; Sankey may use a scrollable container or accessible compact ranked link list. Theme colors never replace textual status/labels. No elaborate animations or chart brushing for P0.

## Global filters and navigation (WU-05)

- English interface, BRL currency, dark-first theme and unbounded historical purchase dates initially.
- The canonical `Filters`/`FilterAction` is defined in `ARCHITECTURE.md` (WU-05). The three global dimensions are multi-select groups; **OR inside one group, AND across groups**. Category options are searchable. Each chosen value has its own removable chip; group clear and global reset remain available.
- Global multi-select filters remain untouched when a user clicks a Sankey ribbon. `focusedFlow` is an independent drill-down dimension. It narrows KPIs, order explorer and matched item charges while the Sankey stays at its broader global context. Focus has a separate chip and clear action.
- Date range stays one inclusive interval; map mode and trend measure remain presentation state. Selecting a month updates the interval but never collapses the time axis.
- Map state clicks **toggle that state in the corresponding group** without replacing other selections; map state counts ignore the currently displayed group to keep additional states available. Selected/focused states have distinct visual emphasis.
- Sankey hover fades other flows only temporarily; click sets or clears persistent focus. Click a different flow to switch. Accessible list buttons mirror ribbon actions. The selected ribbon remains emphasized with the other flows visibly present.
- Keyboard, focus, empty/no-data and low-N states remain required. A focused cohort that becomes empty must show `N/A` and a clear focus action, not invalid numbers.

## KPI cards

P0: distinct eligible orders, on-time percentage (eligible delivered + estimated denominator shown in tooltip), median purchase-to-delivery **fractional days** (1 decimal UI), freight charges divided by matching item price (BRL/BRL ratio rendered %). Invalid/zero denominator = `N/A` not 0%. Numbers come **only from shared selectors**; do not duplicate formulas inside components. P1: previous equal-duration comparison, P95 and segmented freight analysis.

## Brazil choropleth (P0)

- Use attributed and mapped TopoJSON with **27** state polygons, each mapped to a UF code and display name. Validate source license. No GPS or actual route lines.
- **Initial mode Seller origins.** Each state's count is distinct eligible orders having ≥1 matching item from that origin. A multiseller order can be counted in multiple origin states, so state totals do not add to the distinct national order KPI.
- Toggle to **Customer destinations**: map grouped by customerState in eligible order cohort. Preserve existing seller and customer filters and show both chips.
- P0 measure distinct orders only; alternative on-time rate and median performance measures are P1 to protect two-day deadline. For any P1 rate, deduplicate orders per state and disclose delivered eligible denominators. No hatching; muted neutral fill and N tooltip for low samples.
- Click state to toggle membership in the corresponding origin or destination group; tooltip shows dimension, UF/name, exact label, count, qualification and selected state. Zero data regions neutral with label; do not pretend absent data is a measured zero if sample lacks that state.
- React renders paths using `d3-geo`; domain-calculated chart colors use theme semantic tokens, not hardcoded text colors.

## Sankey chart (P0)

- Two separate node sets (`origin:SP` and `dest:SP` even for the same state). **Intra-state SP→SP must remain** a valid flow.
- Aggregate **matching item rows** into `(sellerState, customerState)` directed pairs. P0 weight = **item contribution count** only. Sort all pairs descending by count then stable UF-key tie-break; display **top 15 links**, with eligible-item-count coverage percentage and label `Top 15 seller→customer flows shown`.
- No category/value/freight measure toggle P0; alternate measures P1. No artificial `Other` edge. Unknown state rows are included in overall item KPIs but excluded from mapped Sankey and counted/disclosed in the flow coverage/tooltip denominator decision (coverage relative to **mappable matched items**, and disclose unmappable count separately).
- Tooltip: source/destination, item contributions, current filter scope and percent of mappable count; flow focus is independent; explicit `Commercial seller-to-customer relationship, not a physical route`.
- Click link toggles a focused directed pair while preserving global selections and the full Sankey context. Clicking a different visible link changes focus; no pair is silently added to the state multi-selects.

## Monthly trend (P0)

- X-axis fixed to the dataset's **full valid historical purchase-month range**, even when active purchase-date range is a single month. This chart is the **temporal context view** and intentionally displays non-date-filter cohort values, with a focused-flow overlay when selected, active date selection highlighted, and out-of-range months muted. Label this plainly in legend/tooltip.
- Metric toggle P0: distinct purchases per month or on-time rate (eligible delivered with estimate) by **purchase month**; missing months = 0 purchases for counts, gap/`N/A` for undefined rates. Show small-N warnings on percent rates and sparse first/last partial months.
- **Click a month** to replace the global purchase-date range with that whole calendar month; month click on another mark directly switches selection. Clear date chip restores all history. No drag-brushing P0. If a selected range spans several months, highlight each overlapping month; data outside selection remains visible in muted styling.
- Use a scale of source-derived month keys (YYYY-MM); avoid browser UTC/local shifts. Resize via SVG viewBox and measured container if needed. No inconsistent metric calculations.

## Order Explorer and details (P0)

- TanStack Table with one row per eligible `orderId`; sort/search/paginate (25 rows default). Columns: order ID, purchase date, destination state, status, delivery class, fractional delivery days, **Matching item price**, **Matching freight charges**.
- Matching item columns sum **only eligibleItems** for the order, respecting current seller/category filters. When no item rows or no valid monetary values, show `—` (distinct from known BRL 0). Do not label these numbers `Order total`.
- Drawer shows full-order item list and optional **Full-order item totals**, clearly separated from active matching-item sums; highlight current matching items. Show unknown timestamps as `—`. No duplicate order rows.
- A chart drill-through shows the matching eligible orders and consistent active chips; table rows sortable by date/duration/amount, deterministic ID tie-break.

## Theme, accessibility and UX performance

- Both dark and light are P0. Use CSS custom properties/Tailwind tokens for surfaces, labels, grids, selection, warning and focus colors; header toggle persists chosen mode in localStorage with safe failure fallback, defaults dark, does not modify cohort. Verify axes, SVG labels, legends and tooltips in both.
- Keyboard operability of filters, order table, and accessible equivalents for map/Sankey selection; visible focus indicators, chart text alternatives, tooltips that do not trap focus and reduced-motion support.
- No browser screenshots may be claimed as inspected unless actually captured. Show loading/empty/error states with visible and actionable text.

## WU-07 extension — current interaction design

Ctrl/Cmd-click a Sankey ribbon to add/remove an exact directed pair; plain-click replaces the focused selection (click sole selected ribbon again to clear). The accessible ranked flow button list supports additive toggles without modifiers. Keep contextual links visible but fade unselected ones; selected flow chips and the Clear focus action persist when switching Sankey measures. Pin selected positive-weight flows that fall below the current top 15. A focused zero-weight flow may have no monetary-mode ribbon but must remain in the drill-down and chips.

The order-grain category ranking and delivery-day histogram appear in an expanded analysis section. Equal-length previous-period results appear only for complete valid ranges. CSV export targets the current *dashboard* cohort and explicitly does not apply the order explorer's text search. Saved views are stored locally with Save new, Load, Rename, Delete. See `docs/WU07_SPEC.md` for edge cases.
