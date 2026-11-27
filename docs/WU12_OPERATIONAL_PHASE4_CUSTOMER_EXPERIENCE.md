# WU-12 Operational Expansion — Phase 4: Customer Experience & Satisfaction

## Boundary and prerequisites

This is an **operational dashboard expansion**, not yet the separate WU-12 Analytical Findings / Questions & Investigations engine. Phase 1, Phase 2 (including its regression correction), and Phase 3 Seller Performance must be applied first. No Git commit is included or performed. Do not commit raw Olist input or row-level derived JSON.

### Source ingestion and privacy

The six original required CSVs remain required. `olist_order_reviews_dataset.csv` is now an **optional seventh input** in the source ZIP/directory. If present, the ETL reads only `order_id`, `review_id`, and `review_score` for review analytics, excludes invalid score rows, deduplicates repeated `(order_id, review_id)` pairs, counts orphan rows, and aggregates **five score counts per order**. Raw review messages/titles, individual review IDs, and customer identities are **never exported**. Reviews are **not joined into order/items output rows**; joins must remain at exactly one row per order.

The public export still uses **three atomically published JSON assets** (`orders.json`, `items.json`, `metadata.json`); no extra frontend fetch is added. Existing exports without review metadata load unchanged and show an explicit **review data unavailable** message rather than fabricated zeros. `metadata.json` adds `reviewsAvailable`, `reviewCount` and `reviewedOrderCount`. Reviewed orders have an optional `reviewScoreCounts` array of five nonnegative integer buckets (ratings 1–5). Validation rejects malformed buckets and metadata/row count mismatches.

**To activate real customer satisfaction metrics**, check that the source ZIP includes `olist_order_reviews_dataset.csv`, then run from the repository root:

```powershell
python scripts/prepare_data.py --input data/raw/olist.zip --output public/data
```

Check the command's manifest: `reviewsAvailable` should be `true`, and `reviewCount` / `reviewedOrderCount` should be nonzero for the original Olist dataset. If the file is absent, ingestion is backward-compatible but the new panel will display its unavailable notice. The `.zip` must be the actual source archive, not one of the installation ZIPs.

## Visible panel

The Full Dashboard expands from **11 to 12 independent sections**. The new **Customer experience & satisfaction** card appears after Seller Performance. It offers:

- Reviewed-order coverage and valid-review count, with a clear distinction between the two denominators.
- A 1–5 rating distribution (**individual reviews**, not distinct orders).
- Mean review score and delivery-outcome breakdown (**per-order** average to avoid overweighting multiply reviewed orders).
- Sortable, searchable category / directed shipping corridor / seller scorecards, configurable minimum reviewed-order threshold (1/10/30/100), and 25-row pagination.
- Delivery-score associations qualified by coverage, missing outcomes, overlapping segment membership, selection bias and no causal attribution.

Dashboard global filters and directed-flow focus apply via the existing eligible order/item cohorts. Within a single segment, a multi-item order is counted **once**; across multiple segments, the same order can appear in several rows. Do not sum segment order counts to obtain the dashboard total.

### Saved workspace migration

Layout revision 4 appends `customerExperience` to the registry. Full Dashboard displays all 12 sections. **Historical custom dashboards with 8, 10 or 11 sections** are migrated *in memory* with the new section initially hidden. Their order, filters, visibility, chart view state, active dashboard ID and stored JSON stay unchanged until the user explicitly saves. Invalid partial/duplicate/unknown layouts remain rejected.

## Local acceptance commands

```powershell
npm run typecheck
npm test -- --maxWorkers=1 --no-file-parallelism
npm run test:node
python -m unittest discover -s tests -p 'test_*.py' -q
npm run security:static
npm run build
npm run dev
```

The expected test count depends on additional local tests since Phase 3; **all tests must pass**. An npm `python` configuration warning is not itself a failure.

## Browser acceptance scenarios

1. Verify the Full Dashboard shows **12 of 12 panels visible** and Customer Experience after Seller Performance.
2. With an *old* export, confirm the new panel says reviews were not exported, with no fabricated rating chart or zero-rating claims. Other metrics remain unchanged.
3. Re-export from an Olist archive **containing review CSV**, refresh the dashboard and confirm rating distribution, reviewed-order coverage and delivery-outcome table populate.
4. Confirm selecting origin/destination/category/date filters changes the satisfaction cohort and that a selected Sankey flow narrows reviewed orders consistently with KPI/Order Explorer focus.
5. Select category, corridor, then seller; search segment IDs; sort by rating and reviewed orders; change sample threshold; paginate. These actions must **not** mutate global filters.
6. Verify category and seller scorecard labels clearly state outcomes are **associated** with those segments, not causal fault; multi-item/multi-seller orders must not inflate the overall reviewed-order count.
7. Switch to a historical eleven-section saved dashboard. New section must be hidden with checkbox unchecked; existing order, visibility, and filters must be unchanged. Enable the panel, Save, refresh and confirm persistence.
8. Hide and restore the new panel; verify no loss of reviews data or any global filters. Reorder it via Up/Down and drag-drop.
9. Test dark/light themes, phone-width viewport, overflow and keyboard navigation through search, tabs and table sorting.
10. Verify malformed reviews/unknown timestamps do not produce NaN/negative counts; check Developer Diagnostics for unexpected errors. Do not place any personal review text in diagnostic exports.
11. Confirm full React, Node, ETL/Python, static security and production build gates before staging the files. Keep the feature uncommitted until acceptance.

## Known limits

- **Response bias:** ratings exist only for reviewed orders; differences may reflect who chooses to review.
- **Multiple review records per order:** score histograms count reviews; segment averages count reviewed orders equally.
- **Order-grain causality:** a low score cannot be assigned to a seller, carrier or product in a multi-item order. Associations are *not* proof of responsibility.
- **Legacy data:** the original local production JSON may lack review information. Real review statistics require re-export from the source containing the review CSV.
- **ETL integration:** if DuckDB is unavailable, lightweight Python tests still run but the full Olist rebuild must be verified on the user's machine.
