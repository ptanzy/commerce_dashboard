# WU-00 — Olist Data Profile

**Outcome:** Actual uploaded archive profiled successfully. The geography asset remains a separate verification gate.

## Dataset inspected

- Source: user-uploaded `/mnt/data/archive.zip` (not a direct read of the user's local Windows `data/raw/olist.zip`).
- ZIP SHA-256: `967e41e04fc306fe604e2a693f488995a8b41e5047418f8a5c8e4abd6deca784`.
- Nine original CSV files; 126,186,995 bytes uncompressed.
- All six required P0 files and required columns are present.

| CSV | Rows | P0 |
|---|---:|---|
| `olist_orders_dataset.csv` | 99,441 | Yes |
| `olist_order_items_dataset.csv` | 112,650 | Yes |
| `olist_customers_dataset.csv` | 99,441 | Yes |
| `olist_sellers_dataset.csv` | 3,095 | Yes |
| `olist_products_dataset.csv` | 32,951 | Yes |
| `product_category_name_translation.csv` | 71 | Yes |
| `olist_geolocation_dataset.csv` | 1,000,163 | No |
| `olist_order_payments_dataset.csv` | 103,886 | No |
| `olist_order_reviews_dataset.csv` | 99,224 | No |

## Relational integrity

Unique keys: 99,441 `order_id`, 99,441 `customer_id`, 3,095 `seller_id`, 32,951 `product_id`, 71 translation keys. Item composite key `(order_id, order_item_id)` has **zero duplicates**.

| Check | Unmatched |
|---|---:|
| Orders → customers (`customer_id`) | 0 |
| Items → orders (`order_id`) | 0 |
| Items → sellers (`seller_id`) | 0 |
| Items → products (`product_id`) | 0 |

- **9,803** orders have multiple items.
- **1,278** orders contain items from multiple seller IDs.
- **775** orders have zero item rows; retain them at order grain.
- Never add order counts across overlapping seller-origin state groups.

## Order statuses

| Status | Count |
|---|---:|
| delivered | 96,478 |
| shipped | 1,107 |
| canceled | 625 |
| unavailable | 609 |
| invoiced | 314 |
| processing | 301 |
| created | 5 |
| approved | 2 |

Purchase timestamp extent: **2016-09-04 21:15:19 — 2018-10-17 17:30:18**; no missing purchase timestamp. Missing delivered-customer timestamp: **2,965**, including **8** marked delivered. Estimated delivery date: no missing values. Negative delivery-before-purchase durations: **0** detected. The on-time rule must still defend against negative-duration synthetic fixtures.

For the canonical on-time definition (delivered order, valid purchase/delivery/estimate, nonnegative duration; compare actual and estimated **calendar dates**):
- Eligible: **96,470**.
- Early: **88,644**.
- On the estimated date: **1,292**.
- Late: **6,534**.
- Early + same-day: **89,936**, on-time rate **93.227%**, or **93.2%** shown to one decimal.

Sparse months requiring UI warnings: 2016-09 **4**, 2016-10 **324**, 2016-12 **1**, 2018-09 **16**, 2018-10 **4** purchases.

## Products, locations, and monetary fields

- Customers cover all **27** state codes: `AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO`.
- Sellers cover **23**: `AC AM BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RS SC SE SP`.
- **1,603** item rows resolve to an empty category.
- Used-but-untranslated categories: `portateis_cozinha_e_preparadores_de_alimentos` (**15** items) and `pc_gamer` (**9** items). Use deterministic fallback IDs/labels.
- Source product table has **610** empty `product_category_name` values. Not equivalent to the 1,603 item records above.
- Source item `price` total **BRL 13,591,643.70**; zero invalid, null, negative or zero-price records.
- Source item `freight_value` total **BRL 2,251,909.54**; zero invalid, null or negative, with **383** legitimate zero-charge item rows. Freight is *charged*, not true carrier cost.

The source anomalies fit the canonical `DATA_SPECIFICATION.md`; no changes to the grain/filter contract are required.

## Reproducibility

The profile was executed using Python 3 and its standard library (`zipfile`, `csv.DictReader`, `collections`, `datetime`, `hashlib`). This was analysis code, not the WU-01 production ETL.

To verify that your local ZIP is the same source copy, run:

```powershell
Get-FileHash .\data\raw\olist.zip -Algorithm SHA256
```

Expected digest: `967e41e04fc306fe604e2a693f488995a8b41e5047418f8a5c8e4abd6deca784`.

To reproduce central validations from the original ZIP: read the six CSVs by name with `ZipFile.open` and `csv.DictReader`; use `Counter`/sets for key uniqueness and joins; calculate status/date counts, and compare `datetime.fromisoformat(actual).date()` <= `datetime.fromisoformat(estimate).date()` only for eligible delivered orders. Recompute freight sums with decimal arithmetic in the production pipeline.

**Not yet measured:** Processed JSON byte size, browser-load speed, TypeScript selector latency, generated TopoJSON geometry validity. Those checks must not be reported as passed.
