# Data Specification — canonical POC v2

This is the normative data contract for WU-00 through WU-04. **Do not confuse published schema assumptions with validated observations:** WU-00 must profile the user's actual local `data/raw/olist.zip` and record observed counts/exceptions. An earlier chat-level count is not a substitute for reproducible local profiling.

## 1. Input files and scope

**Required for P0** (six CSVs inside `data/raw/olist.zip` or extracted in `data/raw/`):

| File | Join/fields |
|---|---|
| `olist_orders_dataset.csv` | `order_id`, `customer_id`, `order_status`, `order_purchase_timestamp`, `order_delivered_customer_date`, `order_estimated_delivery_date` |
| `olist_order_items_dataset.csv` | `order_id`, `order_item_id`, `product_id`, `seller_id`, `price`, `freight_value` |
| `olist_customers_dataset.csv` | `customer_id`, `customer_state` |
| `olist_sellers_dataset.csv` | `seller_id`, `seller_state` |
| `olist_products_dataset.csv` | `product_id`, `product_category_name` |
| `product_category_name_translation.csv` | `product_category_name`, `product_category_name_english` |

**Not required for P0:** `olist_geolocation_dataset.csv` (no postal prefix coordinates required for state choropleth), payments, reviews, additional order approval/carrier milestones. Do not perform the million-row geolocation join. The 27 state polygons come from a separately validated and licensed TopoJSON asset.

**Relationships:** order `order_id` unique; item key (`order_id`, `order_item_id`) unique; customer join uses `customer_id` (not `customer_unique_id`); one order may have many sellers and categories; seller state belongs to the **item** not the order. Profile and count missing joins; do not silently duplicate order records.

## 2. Runtime exports

All record exports are generated offline and stay Git-ignored unless publication rights are specifically approved. Use compact camelCase JSON with meaningful types. `schemaVersion` and `processingVersion` must be present in manifest. Do not persist PII, customer names, addresses, city strings or unnecessary timestamps.

### `orders.json` — exactly one row per order

```ts
type DeliveryClassification = 'early' | 'on_time' | 'late' | 'unknown';
interface OrderFact {
  orderId: string;
  customerState: string | null; // UF code
  purchaseDate: string | null; // YYYY-MM-DD in source calendar
  purchaseTimestamp: string | null; // source-local normalized ISO-like string; no Z
  estimatedDeliveryDate: string | null;
  deliveredDate: string | null;
  deliveredTimestamp: string | null;
  status: string;
  deliveryDays: number | null;  // fractional days, NOT rounded at export
  deliveryDayDelta: number | null; // actual calendar day - promised day
  deliveryClassification: DeliveryClassification;
  itemCount: number; // associated item rows, may be 0
}
```

Do **not** store unqualified order-level `itemPriceTotalBRL` or `freightChargeTotalBRL`. Their meanings change when seller/category item filters are active. Compute **matched-item** totals in selectors; details may separately label **full-order** totals.

### `items.json` — exactly one row per original item contribution

```ts
interface ItemFact {
  orderId: string;
  orderItemId: number;
  sellerId: string;
  sellerState: string | null;
  customerState: string | null;
  category: string;       // stable key (prefer English snake_case)
  priceBRL: number | null;
  freightChargeBRL: number | null;
}
```

Use `null` for unavailable/invalid financial values; do not silently substitute zero. Report invalid amounts and exclusions. For category filtering use the stable `category` key; UI uses a deterministic formatter that replaces `_` with spaces and title-cases words (e.g., `health_beauty` → `Health Beauty`, optionally a short explicit exception dictionary for familiar labels). Missing/unknown source category maps to `unknown`; untranslated Portuguese categories use `untranslated:<original_key>` as a stable key, with a readable `Untranslated: ...` UI label. Category filter values must be IDs/keys, not display labels.

### `metadata.json`

```ts
interface DataManifest {
  schemaVersion: 2;
  sourceName: 'Olist Brazilian E-Commerce';
  sourceFiles: string[];
  processingVersion: string;
  purchaseDateMin: string | null;
  purchaseDateMax: string | null;
  orderCount: number;
  itemCount: number;
  unmatchedJoinCounts: Record<string, number>;
  invalidCounts: Record<string, number>;
  provenance: string;
  sampleMode: boolean;
}
```

`public/geo/brazil-states.topojson` is a separate state-boundary asset. **No `geo-flows.json` or `locations.json` is required for P0.** Source-derived records and metadata may remain only in local ignored `public/data/`. Add `/public/data/` to the repository `.gitignore` before generating outputs; `data/raw/` and `data/processed/` should also be ignored. If P0 asset size/latency is problematic, benchmark and document before changing these contracts.

## 3. Canonical filters and data cohorts — superseded by WU-05

`Filters` now uses **arrays** `sellerStates`, `customerStates`, `categories`, with empty arrays meaning *no restriction*. Within any group, selected codes combine with **OR**; across groups they combine with **AND**. Seller and category restrictions apply to the **same item contribution**. `focusedFlow` is a separate directed pair constraint for a drill-down, **not** a replacement for the global dimensions. Dates remain one inclusive interval of source calendar dates.

1. `contextCohort=selectCohort(index,filters)`: valid date and selected customer states select base orders; matching items must satisfy both seller-state group and category group; if either item group is constrained, eligible orders are distinct IDs represented by matching items; without item group constraints, zero-item orders are retained.
2. `focusedCohort=selectFocusedFlowCohort(contextCohort,filters.focusedFlow)`: when focused, retain only matching item rows where **both** `item.sellerState` and `item.customerState` equal the focused pair, then deduplicate their order IDs. When focus is null, use the context as-is.
3. KPIs, the order explorer and matching-item financial sums use `focusedCohort`. The order detail drawer still shows every original item, with matching items identified by the current global groups **and** focused pair; full-order values are labeled separately.
4. Sankey uses **contextCohort** and its top 15 item-contribution links regardless of focus. Hover previews a ribbon; click toggles focus while retaining all other links. Focused unrelated ribbons are dimmed, not removed. Clicking another link switches focus.
5. Map state counts use a **context without the map's currently displayed state dimension** to allow adding other origins/destinations (retain dates, category and the other state group). Highlight selected states and the focused pair's applicable state. Countrywide distinct orders are never calculated by summing overlapping origin-state counts.
6. Monthly trend uses the full historical month domain, ignores the date constraint for temporal context, retains global non-date filters and shows focused-month overlay when a flow is selected. Tooltip/legend must distinguish context from focus.
7. Individual selection chips remove only one value. Clearing a dimension empties that group. Focus can be cleared separately. An incompatible origin/destination group change clears focus automatically.
8. Zero-item orders are eligible when no seller/category item group is constrained and no flow is focused; they contribute nothing to item-based metrics. Display unavailable amounts as `—`, not an invented BRL zero.

**Example:** An order contains SP/electronics and RJ/furniture items delivered to MG. Selecting sellers SP+RJ and categories electronics+furniture retains two matched items and one order. Focusing SP→MG keeps only the SP item in matching freight/value and still counts the order once. The Sankey continues to display all global-context flows, including RJ→MG.

## 4. Metric definitions

| Metric | Exact rule |
|---|---|
| Distinct orders | `eligibleOrders.length` (valid purchase-date requirement) |
| Delivered duration eligible | `status === 'delivered'`, valid purchase and delivered timestamps, `deliveryDays >= 0` |
| On-time eligible | Delivered duration eligible **and** valid estimated delivery calendar date |
| On-time rate | `actual calendar date <= estimated calendar date` / count on-time eligible; `N/A` if denominator zero |
| Classification | `early` if actual date < estimated date; `on_time` if same; `late` if after; `unknown` unless duration/coherence + valid estimate satisfy eligibility |
| Duration | `(deliveredTimestamp - purchaseTimestamp)/86_400_000` **fractional days** from source-naive normalized timestamps; null if negative or invalid |
| Median/P95 | R-7 linear interpolation: position `(n-1)*p` in sorted valid durations, interpolate adjacent observations; matches `d3.quantileSorted` and continuous percentiles; round to one decimal **only for UI** |
| Date delta | integer actual source calendar day minus estimated source calendar day; null for unknown/incoherent |
| Freight ratio | `sum(valid eligibleItems.freightChargeBRL) / sum(valid eligibleItems.priceBRL)`; `N/A` if eligible price sum <= 0; count/reveal excluded invalid amounts |
| Monthly volume | Distinct eligible orders grouped by **purchase month** |
| Monthly on-time | On-time rate over delivered-and-estimate-eligible purchase-month cohort; flag small denominators |

For a delivered order with delivery before purchase, **force `deliveryDays=null`, `deliveryDayDelta=null`, `deliveryClassification='unknown'`** and exclude from both duration and on-time calculations. Date-only estimated delivery is inclusive through end of calendar day. Missing financial values are not cast to zero and must be counted; positive sums use valid rows only with disclosure in profiling/tooltip. Money is customer **freight charged**, not actual logistics cost. Use BRL. Source Olist timestamps contain no timezone offsets; parse consistently as source-naive values without appending or inventing `Z`.

## 5. Sankey, trend, and map aggregation

- Sankey P0 is **item contribution count**. Aggregate all matching item rows into directed `(sellerState, customerState)` links, including `SP→SP` with **distinct origin:SP and destination:SP node IDs**. Sort descending by weight, take **top 15 directed links**; show `% of total eligible item-link weight displayed`; no `Other` synthetic link. P1 weight toggle may offer total valid freight or item price (must use corresponding measure/denominator).
- Map uses all 27 Brazilian UF state polygons, with two-letter UF identifier mapping validated; non-active states neutral. P0 metric distinct order count per state; P1 rate/duration metrics only if time. States with low denominator show explicit N in tooltip and neutral/muted warning when appropriate; no hatching required.
- **Trend chart domain:** X-axis remains anchored to all valid historical purchase months (or the same pre-date-filter context) even when a month/date filter is selected. Bars/lines show counts for the non-date-filter cohort with selected date interval highlighted, and values outside date selection rendered muted. **KPI/table/map/Sankey** use current full filter cohort. Trend tooltips must disclose contextual scope. This exception prevents a month click from collapsing the chart to one point. Clicking a month replaces the selected date range with that calendar month (can click a new month directly); explicit clear restores all history. P0 click-to-select only; no brush interaction.
- Sparse first/last months and low-population state rate estimates display count/denominator and a low-N indicator; do not interpret 0 or 100% from one observation as stable performance.

## 6. ETL procedure and validation

1. Read directly from locally supplied ZIP/extracted CSVs, validate exact required columns, unique keys, row counts, null patterns, and referenced keys with DuckDB. Avoid joining raw 1M-row geolocation.
2. Derive source-naive normalized dates/valid durations. Translate categories via English lookup; apply stable fallbacks. Only export needed columns.
3. Build a **left-joined order-grain** export and **item-grain** export separately; never create a wide cross-product export.
4. Validate order/item uniqueness, join accounting, 2-letter states, financial nulls, delivery coherence, totals, sample examples, and export schema.
5. Sort `orders.json` purchase timestamp DESC then order ID; sort `items.json` by order ID then item ID. Build stable outputs with normalized number/date semantics; generation time can be logged separately without breaking determinism.
6. Record source checksums, actual asset sizes (uncompressed and transferred if measured), observed counts, run commands, invalid/excluded row counts in `docs/DATA_PROFILE.md`. Do not assert a particular JSON size or parse latency before measuring.
7. Record dataset and topology source URLs, exact license and required attribution in `docs/DATA_PROVENANCE.md`. Olist listing currently states CC BY-NC-SA 4.0; local use is the current scope. Keep data exports out of Git until the owner approves a distribution decision.

## 7. Outstanding verified-at-runtime decisions

- Profile local ZIP and decide how invalid financial rows are excluded or quarantined; state rules in `DATA_PROFILE.md` and test them.
- Pin exact geographic TopoJSON source (see candidate links in `DECISIONS_AND_RISKS.md`), record license and inspect if feature IDs use UF strings or IBGE numeric codes. Require **27 unique state features** and a complete mapping to two-letter codes before map acceptance.
- Benchmark realistic JSON payload and selector latency before adding optimization. Do not assume an estimated 65–75MB is factual.

## WU-07 extension — supersedes singular focusedFlow references above

The new canonical field is `focusedFlows: FlowPair[]`. Empty means global cohort; nonempty means **OR between exact `(sellerState, customerState)` item pairs**, AND with the global date/customer/seller/category filters. Do not combine selected origins/destinations as independent disjunctions and accidentally introduce cross-pairs. Order totals remain distinct; matched-item money includes only items in at least one selected directed pair. Filtered CSV exports these eligible orders only. No extra source columns or ETL exports. Refer to `docs/WU07_SPEC.md`.
