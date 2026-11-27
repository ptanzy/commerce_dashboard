# WU-12 operational UI: configurable table length

## Behavior

- **10 rows** is the default for the four paginated dashboard tables: Order Explorer, Shipping Corridor Scorecard, Seller Performance, and Customer Experience (Satisfaction by Segment).
- Each table has its own **Rows per page** dropdown with strictly bounded choices **10 / 25 / 50 / 100**.
- Search, sorting, and filtering still operate on the *whole eligible table*, not only the visible page. Changing page length resets that table to page 1. Changing the cohort and sorting retains their existing reset logic.
- This is **per-table, per-dashboard** configuration; it is not a global setting or a saved filter view.
- The dashboard's existing **Save / Discard / Cancel** model applies: changing a page size marks the active dashboard as unsaved. On a named dashboard, **Save** persists it and **Discard** restores the saved size. Full Dashboard remains immutable and can be duplicated or used as the source of a new named dashboard.
- Switching between named dashboards restores each dashboard's independent table lengths; hiding and restoring a table does not clear its saved length.
- Older saved dashboards that predate table pagination are normalized in memory with four 10-row defaults. Simply loading them does *not* rewrite localStorage. New imports are schema-validated, unknown keys/invalid sizes are rejected.
- The Customer Experience table appears when review data is available and a selected cohort contains reviewed orders. Other parts of that panel (review histogram and delivery-outcome summary) remain unaffected by page-size settings.

## Install

Extract the ZIP at the repository root. All files are complete replacements; no Git patching or new dependencies.

## Automated verification (Windows PowerShell)

```powershell
npm run typecheck
npm test -- --maxWorkers=1 --no-file-parallelism
npm run test:node
npm run build
npm run dev
```

If time-constrained, target the new UI tests and the three updated legacy pagination suites:

```powershell
npx vitest run tests/ui/wu12_table_page_sizes.test.tsx tests/ui/orders.test.tsx tests/ui/wu12_operational_ui.test.tsx tests/ui/wu12_seller_performance.test.tsx tests/ui/wu12_customer_experience.test.tsx --maxWorkers=1 --no-file-parallelism
```

## Browser acceptance

1. In Full Dashboard, all four tabular panels that are available should show **10** per page. Review data must be imported for the satisfaction segments table to appear.
2. Change Order Explorer to **25**, Shipping Corridor to **50**, and Seller Performance to **100**. Check displayed row ranges, Next/Previous behavior, and correct row counts after sorting/searching.
3. Expand Dashboard Workspace. Confirm **Unsaved changes**. Full Dashboard's Save remains protected; create a new dashboard **from current view** and verify the three sizes are copied.
4. Change one table to a different size. Confirm the stored dashboard JSON does not update until **Save**. Press **Discard changes** and check the original size returns. Save another change; refresh and verify persistence.
5. Create a second named dashboard with different lengths. Switch between them and verify each table adopts the right configuration. Hide, save, and restore a table to verify its length survives conditional unmounting.
6. Verify original eight-, ten-, eleven- and twelve-section dashboard snapshots load, retain layouts and filters, and receive default page sizes without an implicit storage write.
7. Confirm the latest `npm run test:node` and React suites remain green, including no changes to cohort totals, shipping flows, review aggregation, or saved filter views.

Leave changes uncommitted until the local automated and browser checks pass.
