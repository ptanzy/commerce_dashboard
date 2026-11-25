# WU-08 — Error Handling, Logging and Local Observability

**Baseline:** `feature/dashboard-poc` at `dd19c2c45552a91e10703930078d56f8a4d41089` (WU-07 committed).
**Scope:** local error recovery, privacy-preserving structured diagnostics, and instrumentation. No additional analytical features, hosted services, new npm dependencies, or data-schema changes.

## Delivered

1. **Error boundaries.** A root `UiErrorBoundary` catches unanticipated React render/lifecycle failures. Chart, analytics, and order-explorer sections receive independent boundaries so one broken visualization need not destroy the entire dashboard. Fallbacks support retry and reload; logging saves only `RENDER_FAILED` plus a fixed area label.
2. **Global browser errors.** `error` and `unhandledrejection` events are counted using fixed event codes. Raw errors, stacks, URLs, rejection values, and filenames are **not** recorded.
3. **In-memory telemetry.** `src/observability/diagnostics.ts` maintains up to **200** structured events and up to **40** timings per known operation. It uses typed/runtime-validated codes, fixed areas, finite numeric measurements, and immutable snapshots for `useSyncExternalStore`. No outbound telemetry, localStorage logging, or background uploads.
4. **Diagnostics drawer.** A small header control shows dataset/geography/browser-storage health, latest/average durations, event counts, and a capped recent-events view. Optional export creates a local JSON download. Clearing event history does not erase application state.
5. **Recovery and measurement.** Dataset retry and geography retry, recognized loading and storage errors, guarded CSV export cleanup, and operation timings for dataset load/validation, global filtering, focused filtering, KPIs, map/trend/Sankey aggregations, order explorer, and CSV preparation.
6. **ETL diagnostics.** `scripts/prepare_data.py` and `scripts/prepare_geo.py` emit structured start/completed/failure events to stderr. Their existing JSON result reports remain on stdout. No archive paths or raw records are put into the new stderr events.
7. **Regression tests.** Added bounded-log/privacy/health/subscription/global-handler tests, diagnostic UI/recovery/export tests, and Python structured-log tests. Previous analytics and UI contracts remain unchanged.

## Local validation

```powershell
cd C:\Users\ptanz\job_search\commerce_dashboard
git checkout feature/dashboard-poc
# Extract WU-08 ZIP over the existing repository, replacing matching files.
npm install
python -m unittest discover -s tests -p "test_*.py" -v
npm run typecheck
npm test
npm run test:node
npm run build
node tests/check_olist.cjs
node tests/check_explorer.cjs
npm run dev
```

**Manual checks:** Open **Diagnostics** in dark and light themes. Verify health and timings appear after dataset loading/filter changes. Try changing Sankey measure, searching/sorting orders, and exporting CSV. Export the diagnostic JSON and inspect it for data values or personally identifying fields (none should be present). Test with missing `public/data/metadata.json` (temporarily rename only if desired), verify loading error and retry, then restore it. Test a missing topology file separately and verify **Retry loading map**. Verify keyboard access and a narrow browser width. Do not intentionally corrupt committed assets or edit the real source ZIP.

## Checks performed in the preparation environment

- `npm run test:node`: **45/45 passed** (39 earlier regressions + 6 WU-08 cases).
- Python unittest discovery: **12 passed**, **1 DuckDB integration test skipped** because DuckDB is not installed here.
- TypeScript domain build and TypeScript/TSX parser checks passed.
- **Not run here:** full React typecheck/Vitest/browser build (React dependencies unavailable in this environment). These are required local acceptance gates. Do not claim WU-08 completed until they pass.

## Known limitations / next work units

- Metrics are **instrumentation durations**, not full browser paint or long-task measurements. WU-10 should benchmark rendering, memory, and p95 interaction latency under load.
- Error boundaries don't catch event-handler errors; explicit `try/catch` and browser unhandled-error listeners cover different failure paths.
- Diagnostic logs are ephemeral per tab and deliberately omit raw stack traces. No automatic error uploads.
- Python exports remain atomic **per file**, not a transactional multi-file commit; test interrupted exports in WU-10.
- npm audit advisories, security scans, and fuzz/penetration testing are deferred to WU-09/WU-11.
- Final consolidated architecture/operator/end-user documentation remains deferred to **WU-N**, after WU-12 feature work and any further work units.
