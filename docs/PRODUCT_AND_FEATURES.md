# Product and Feature Requirements

## 1. Objective

Build a concise portfolio-grade dashboard demonstrating trustworthy analytical modeling, thoughtful React architecture, and meaningful custom D3 interactivity, using historical Olist Brazilian e-commerce records. The initial user is an analyst evaluating **delivery reliability, geographic differences, and freight charges**.

### Product question

> Where are deliveries slower or less reliable, which sellers and destination states contribute to these patterns, and how can an analyst drill down to underlying orders?

### Success criteria

An analyst can select a purchase-date range, destination state, and product category; view consistent updated KPIs, geographic data, trends and state-to-state flows; click a relevant mark to filter; and inspect supporting order records. Every displayed metric can be explained using documented source fields and rules.

## 2. Priority and constraints

**P0 / required for completion**

- Responsive dashboard shell with dataset/source/time-period identification.
- Purchase-date range, customer/destination state, and product-category filters, with reset and visible active filters.
- Four KPI cards: distinct orders, on-time delivery percentage, median purchase-to-delivery days, freight/item value ratio. Non-delivered/unknown records excluded when appropriate.
- Brazil state-level D3 geographic view with selectable destinations and delivery performance metric.
- D3 Sankey with aggregated seller-state -> destination-state flows; links based on **item/order-seller contribution**, not actual routes.
- Monthly D3 trend of order volume and delivery performance.
- Searchable/sortable/paginated order explorer and order detail view.
- Consistent drill-through, empty states, tooltip labels and data provenance.
- Automated correctness and interaction checks plus static production build.

**P1 / high-value enhancements if P0 is stable**

- Previous equal-duration purchase-date period comparison.
- Median and P95 delivery-duration toggle or band and distribution.
- Early/on-time/late distribution; freight ratio segmented by state or category.
- Hover highlights, chart-specific legends, small transitions and mobile refinements.

**P2 / defer**

- Carrier performance, live events, delivery GPS trajectories, warehouse capacity, route optimization, predictive ETAs, user accounts, persistent personal preferences, automated shipments and full admin reporting.

## 3. Data-supported features

| Business concept | Evidence available in Olist | Dashboard feature / qualification |
|---|---|---|
| Purchase volume | `olist_orders_dataset` order IDs and purchase timestamps | Distinct order KPIs and monthly volume |
| Delivery punctuality | Actual customer delivery + estimated delivery | On-time and lateness for valid delivered records only |
| Delivery duration | Purchase and actual customer delivery | Purchase-to-delivery duration, **not** carrier transit time |
| Freight charged | `olist_order_items_dataset.freight_value` | Sum of freight charges by eligible items; **not** seller carrier cost |
| Product categories | Products plus Portuguese-to-English category translation | Product filter; untranslated values get explicit fallback |
| Geographic demand | Customer state and city, optional geo coordinates | State-level choropleth |
| Seller-to-buyer relationships | Item seller IDs and customer IDs | Aggregated seller-state to customer-state flow connections, **not physical driving routes** |
| Actual carrier / route | Not present | Explicitly excluded |

## 4. Screen sections

1. **Header and filters:** Dashboard title, dataset years, data-source caveat, date range, states/categories, reset.
2. **KPI strip:** Orders, on-time rate, median delivery days, freight-to-item value, each with denominator/eligibility tooltips.
3. **Primary analysis:** Brazil state choropleth and time-series side by side on wide screens.
4. **Trade/flow investigation:** Top-N seller-state to customer-state Sankey, value selector (`item freight`, `item value` or item-link volume), explicit metric label.
5. **Detailed records:** TanStack Table, full-order details and linked seller/item contributions.

## 5. User stories and acceptance

**US-01 Overview.** Given no filters, display eligible totals and the purchase date extent. The app never implies its records are live.

**US-02 Cross-filter.** When the user clicks a destination state on the map, the selected destination chip appears, KPIs/trend/table update, and the Sankey reflects the same cohort. Clicking again or clearing the chip restores the previous cohort.

**US-03 Product scope.** When the user selects a category, the cohort is **orders containing at least one matching item**; order counts and durations count each order once; item price and freight totals include **only matching items**. The UI labels this mixed scope wherever needed.

**US-04 Flow investigation.** Clicking a Sankey link filters seller state and customer state; drill-through lists orders having matching eligible item contributions. All charts reflect the filter; the total flow metric is not mislabeled "distinct orders" when an order contributes multiple seller/category links.

**US-05 Reliability.** On-time metrics exclude canceled, pending, and delivered orders with missing essential timestamps; date-only estimates are treated as end-of-calendar-day inclusive. Tooltips disclose denominator.

**US-06 Exploration.** User can search by order ID, sort relevant columns, change pagination, view order details, and return to unfiltered view.

**US-07 Trust.** A visible source/provenance control states: historical Olist purchase and delivery records, Brazilian geography, flow lines approximate relational connections, no live transport tracking.

**US-08 Non-happy paths.** No-data filters, invalid source rows, untranslated categories and location gaps do not crash or silently introduce fabricated values.

## 6. Explicitly out of scope

No role-based permissions, checkout, payments, inventory, carrier comparison, tracked package path, high-frequency live dashboard, custom user reports, or production data service. No assumption that Olist data represents Brazil's entire e-commerce market.
