# Visualization and UX Specification

## 1. Design objective

The dashboard should answer a progression of questions: **How are we doing? -> Where is performance different? -> Which flows explain this? -> Which orders are involved?** Give the user one obvious interaction at a time rather than presenting a wall of unrelated charts.

## 2. Page layout

Desktop (>= 1100px):

```text
+--------------------------------------------------------------------+
| Delivery Intelligence       Source / about     [Dark/Light toggle] |
| [Purchase date] [Destination] [Category] [Seller] [Clear filters]  |
| Active: [RJ x] [Health & Beauty x]                                 |
+----------------+----------------+----------------+-----------------+
| Orders         | On-time        | Median days    | Freight/price   |
+----------------+----------------+----------------+-----------------+
| Brazil seller-origin map [Origin/Destination] | Monthly trends         |
| metric switch + hover/click             | volume + performance        |
+----------------------------------------+----------------------------+
| Seller state -> customer state Sankey + measure/top-N controls       |
+--------------------------------------------------------------------+
| Order explorer: search / sortable columns / pagination             |
+--------------------------------------------------------------------+
```

Tablet: primary charts stack; cards become 2 columns. Phone: cards 2 columns or 1, filters in wrapped row, map/chart full width, Sankey uses horizontal scroll or simplified top-N list when layout cannot stay readable. Maintain accessible action targets.

## 3. Global UX

- English interface with geographic names as commonly used in Brazil; BRL formatted with currency label.
- Start with **all** available valid purchase dates (both ends of the actual source date extent), not fake live/last-30-day defaults.
- Filters: purchase date from/to (inclusive), destination state, category, optional seller state. Show active chips with per-chip clear and a global reset. `All` is distinct from null/missing.
- Exactly one source of truth for filter state; clicks can add/change filters but never maintain invisible chart-only subsets.
- All KPIs/charts/tables share the current **order cohort**; item measures additionally use the matching-item subset.
- Clear loading and error state with retry; empty results should show "No orders match these filters" instead of `NaN` or zero rates.
- Show source attribution: "Olist historical Brazilian e-commerce sample; commercial flows, not tracked delivery routes." Link to dataset source in About.

## 4. KPI row

P0 metrics: **distinct order count, on-time rate, median purchase-to-delivery days, freight charges / item price**. On hover or focus, show numerator/denominator and missingness handling. On-time rate and median are "N/A" if no eligible delivered orders; freight ratio "N/A" if total matched item price <=0. Never show 0% for absent denominator.

P1 comparison chips: same number of inclusive calendar days immediately preceding the selected purchase-date range, with the same non-date filters. Show `+ / -` and explicit comparison wording; if no previous data, show "No comparison data". Positive/negative interpretation differs by metric (lower median days is good, lower ratio generally favorable but only descriptive).

## 5. Brazil origin/destination choropleth (D3 Geo)

- Geography: 27 state regions using licensed, validated TopoJSON; tooltip includes full state name and code.
- **Default geography: seller origin state**; allow toggle to customer destination state. The default metric is **distinct orders with at least one qualifying item from that seller state**, not summed distinct-order counts across states. Switch to on-time rate or median order delivery days for those state-specific cohorts. Each mode needs a matching denominator and legend. Destination mode uses distinct orders by customer state.
- Low-volume states: for rate/duration metrics, show population sample count and consider hatch/neutral color for states below a documented threshold (e.g. 20 valid delivered orders); do not imply precision.
- User action: click a state to toggle the **seller-state filter in origin mode** or **customer-state filter in destination mode**; selected border and active chip identify the dimension. Selecting a different mode does not silently clear the previously selected other-dimension filter; show both chips. Non-selectable zero-data regions remain visible and labeled.
- No individual delivery route lines by default. If origin-destination connections are later added, represent relationships only, not roads.
- SVG responsive via `viewBox`; use D3 projection and geo path generators; React renders SVG state elements.

## 6. D3 Sankey flow diagram

- Flow: seller state -> customer state **aggregated from item contributions**, not observed transportation legs.
- Default weight: number of matching item rows (label "Item contributions"). Alternative: `freightChargeBRL` or `itemValueBRL`; these give additive meaningful weights. `distinctOrderCount` cannot be used for additive Sankey totals across multi-seller buckets without careful deduplication.
- Default scope: top-N origin and destination states based on current weighted flow, with `Other` grouping only where it preserves link identity honestly; otherwise hide low-volume links with note "Top N shown" and display share of total.
- All weights must be finite and non-negative; ensure zero-weight links are omitted. Avoid duplicate node IDs by namespacing `origin:SP` / `dest:SP`.
- Tooltip: seller/destination states, selected weight, category/date filters, percentage of displayed eligible flow; explicit "origin-destination relationship, not physical route" note.
- Click link: apply seller and customer state filters; selecting another replaces the pair. Provide visible clear. Selecting a node can apply the appropriate dimension only.
- Reduced-motion preference disables or minimizes layout transitions.

## 7. Monthly trend chart

- X-axis: month of purchase, sorted chronologically, labels `Jan 2018` (not browser-local date inference).
- Mode A: distinct order volume by purchase month; Mode B: on-time rate by purchase month; P1 optional median and P95 duration lines.
- Domain should include valid months across selected range; missing months render as zero volume for counts, missing data (gap) for rates/durations.
- Brushing/selection: drag or pick a date range to set global purchase-date filter; include a "Clear date selection" affordance. A simple click-based month-range selector is an acceptable P0 fallback if brushing is complex.
- Tooltips: month, population count, numerator/denominator where appropriate, formatted metric and global filters.
- Chart must handle 1 month and zero-data cases without broken axis or division-by-zero.

## 8. Order explorer

- Use TanStack Table: order ID, purchase date, customer state, status, delivery classification, purchase-to-delivery days, item price, charged freight.
- Search by order ID; sorting by date, duration, amount; client-side pagination of current cohort (default 25 rows); deterministic tie-break by ID.
- Clicking a row opens a side panel/inline detail containing order timestamps, destination, estimated versus actual delivery, classification, and associated items/seller states/categories. If category filter is active, mark matching items distinctly but allow viewing all original items.
- Show `—` for unknown fields, not silently substitute zero.
- Accessible labels on sorting controls and buttons, keyboard-openable details, focus management, visible focus rings.

## 9. Chart integration contract

```ts
interface Filters {
  purchaseDateFrom: string | null;
  purchaseDateTo: string | null;
  customerState: string | null;
  sellerState: string | null;
  category: string | null;
}

type FilterAction =
  | { type: 'set_date_range'; from: string | null; to: string | null }
  | { type: 'set_customer_state'; state: string | null }
  | { type: 'set_seller_state'; state: string | null }
  | { type: 'set_category'; category: string | null }
  | { type: 'clear_all' };
```

A Sankey link click dispatches two filter actions in one reducer action / batch to avoid transient mismatches. No chart should mutate global SVG nodes outside React ownership or retain a second independent canonical filter state.

## 10. Visual style

Modern analytical SaaS visual language with **both dark and light themes**, dark first-visit default. Use semantic CSS variables for page background, cards, text, borders, focus ring, chart grid, SVG labels, sequential scales, and warning/success states. Provide a visible theme toggle in the header with accessible name and pressed/selected state. Persist preference in localStorage with a safe fallback; do not require OS-preference detection. Theme changes must not reset filters, scrolling, or selected records. Verify readable contrast, legible tooltips/legends, and meaningful chart color differentiation in both modes; never communicate a value only with red vs green. Design first for desktop capture at ~1440 px wide, but maintain mobile usability.

## 11. Accessibility and responsiveness

Keyboard access to all functional controls, focus outlines, descriptive SVG titles/accessible chart summaries, data-table alternative for critical chart values, readable legends, contrast checks, reduced-motion consideration. All charts need meaningful empty/error/loading states.
