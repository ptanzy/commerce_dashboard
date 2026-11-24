# WU-07 — Implementation Handoff

## Work Unit
WU-07 — Advanced Exploration and Multi-Flow Sankey Selection

## Status
**PARTIAL — code packaged, full local React/build/browser acceptance pending.** Do not commit until these pass.

## Baseline
`ptanzy/commerce_dashboard`, branch `feature/dashboard-poc`, head `5bab9ed4680601f1967fd47c732dff5e317d083f` (`feat: complete WU-06 expanded delivery analytics`). The checked-in WU-06 source hashes matched the local baseline. The WU-07 package is a file overlay, not a Git commit or push.

## Changes
- `focusedFlows` array replaces singular `focusedFlow`; reducer supports plain-click replacing, additive selection, incompatible pair reconciliation, and validated restoration. Sankey always uses global context, adds selected positive-weight non-top-15 pairs, keeps selected ribbons highlighted while dimming unselected ones; list selection is additive without modifier, ribbon Ctrl/Cmd-click is additive. Map/trends, order detail, active chips and focused cohort updated.
- New domain modules: `exploration.ts` for category rankings (distinct orders, monetary/grain validity, rates), calendar-day delay histogram and date-bounded previous-period metrics; `exportCsv.ts` for safe client-only order CSV; `savedViews.ts` for validated filters and views.
- New UI: `AdvancedExploration.tsx`, `SavedViews.tsx`; integrated into the dashboard. Existing tooltip labels, styling and docs updated.
- Node regression suite includes `tests/wu07.node.cjs` (10 cases). UI coverage in `tests/ui/wu07.test.tsx` (5 cases) plus migrated WU-05 single-focus assertions.
- Package version `0.5.0`. No new external dependencies; `npm install` may update existing `package-lock.json`.

## Validation performed here
- **PASS:** `tsc -p tsconfig.node-tests.json` — domain code compiles.
- **PASS:** `node --test tests/domain.node.cjs tests/orderExplorer.node.cjs tests/wu05.node.cjs tests/wu06.node.cjs tests/wu07.node.cjs` — 39/39.
- **PASS:** Python `unittest discover` — 10 passed, 1 skipped (DuckDB absent in this environment).
- **PASS:** TypeScript `.ts` / `.tsx` transpile-parser diagnostics — no syntax errors.
- **NOT RUN:** Full `npm run typecheck`, `npm test`, `npm run build` — dependencies are not available and npm offline cache is incomplete in this sandbox.
- **NOT RUN:** Real local Olist file checks and browser acceptance — source derived records are Git-ignored and not available in this workspace.

## Data and Provenance
No changes to `scripts/prepare_data.py`, raw data, generated `orders.json`/`items.json`, or map topology. The source dataset remains Olist under CC BY-NC-SA 4.0 (noncommercial local use) and the existing state geometry retains its separate MIT attribution. CSV is explicitly a user-triggered local export and contains no customer/seller identifiers or addresses.

## Known issues / manual verification
- Test full React TypeScript/RTL/build and production preview on Windows. Browser inspect selected flows after top-15 re-ranking; localStorage failure handling; CSV format and count; performance with full ~99k records; both themes and mobile layout.
- The historical npm audit reported three dependency advisories in WU-06; audit and review before committing, without blindly running `npm audit fix --force`.
- Exporting all orders may allocate several MB of browser memory; avoid implying instantaneous performance until measured.

## Local gate

```powershell
cd C:\Users\ptanz\job_search\commerce_dashboard
npm install
python -m unittest discover -s tests -p "test_*.py" -v
npm run typecheck
npm test
npm run test:node
npm run build
node tests/check_olist.cjs
node tests/check_explorer.cjs
npm audit --omit=dev
npm audit
npm run dev
```

Verify actual rendering, especially selection of two flow pairs, category modes, delay distribution, previous-date window, CSV output, saved view restoration, dark/light and mobile. Review staged files to exclude raw and derived data.

## Next Allowed Work
Only local WU-07 acceptance fixes and subsequent commit/push after owner confirmation. Do not begin a further WU or deploy publicly without authorization.
