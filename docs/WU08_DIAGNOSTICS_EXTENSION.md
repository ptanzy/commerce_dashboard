# WU-08 — Diagnostics completion addendum

Status: **implementation patch, pending local TypeScript/React/production-build and browser acceptance**. Apply on top of both the original WU-08 implementation and the WU-08 session activity patch. Do not commit before acceptance.

## Changes

- **Error-time state snapshot:** The last successfully committed dashboard state is summarized as six aggregate fields: origin/destination/category counts, number of selected directed flow pairs, date-filter active flag, and distinct eligible orders. Error and fatal events embed this whitelisted state and an allowlisted chart-mode snapshot, so changing the measure afterward cannot overwrite the captured failure context. The panel can also record a manual snapshot event. **It does not record raw filter values, names, item/order IDs, source records, or free-text exception details.** A snapshot is the most recent committed state, so it may precede a render crash.
- **Build metadata:** Version from `package.json`, Git commit if available, and bundler timestamp are injected into `import.meta.env` at build/configuration time. The UI displays them alongside allowlisted browser/OS families, validated dataset schema, and safe processing-version/count metadata. Raw User-Agent text and raw manifest strings are never exported. A packaged build without Git still works (commit `unavailable`). To see WU-08's final commit rather than the previous HEAD, **rebuild after committing**.
- **Operation traces:** Up to 80 recent timing entries, each tagged with a unique measurement sequence and optional most-recent user-action ID (within 30 seconds). Linking an operation to a user action is temporal correlation, **not a causal or complete end-to-end trace**.
- **Performance summaries:** Rolling 40-sample count, latest, mean, P95 nearest rank, maximum, and slow count. Thresholds are static/provisional; an exceedance emits `OPERATION_SLOW`, and is not by itself a service failure.
- **Health checks:** On-demand check of previous successful dataset validation, previously validated 27-state geometry, and non-destructive session/local storage round-trips. Pass/warning/fail/unsupported is explicit. This is a status probe, not a full dataset re-validation. No HTTP requests or telemetry.
- **Diagnostics exploration and export:** Filter displayed events by severity, subsystem, or fixed event-code substring. Export remains user-initiated JSON and now includes build info, current whitelisted state, chart modes, errors with error-time state, bounded traces and health-check results. No screenshots or third-party reporting.

## Local acceptance

From `C:\Users\ptanz\job_search\commerce_dashboard`:

```powershell
npm run typecheck
npm test
npm run test:node
npm run build
```

Inspect both dark/light themes and mobile width. Open Diagnostics, verify build identity, run health checks, select global filters and Sankey pairs, capture a state snapshot, switch the Sankey measure, inspect P95 and trace association, filter the event history, and export JSON. Verify the report has no raw Olist records or user-entered strings and that the activity trail persists across same-tab reloads. Rebuild after commit if you need a matching Git commit ID.

**Scope:** This patch modifies only observability wiring, the diagnostics panel, its CSS and tests, the Vite build metadata, and this handoff. It adds no analytics features or external network services. Security adversarial testing remains WU-09; thorough browser/performance acceptance remains WU-10.
