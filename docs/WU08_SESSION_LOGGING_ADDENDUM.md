# WU-08 addendum — Anonymous session activity and correlated errors

This patch applies **after** `commerce_dashboard_WU08_implementation.zip`, before local acceptance and commit.

## Behavior

- One random, anonymous diagnostic session label per browser tab, persisted in `sessionStorage` where supported. It is *not* an authenticated user identifier, login, tracking cookie, or secret.
- Bounded session history of up to 200 structured diagnostic events, restored across page reloads in the same tab when browser storage is available. Disabled/private storage falls back to in-memory only. No remote telemetry, API calls, or raw record uploads.
- UI activity uses an allowlist of fixed action codes covering filter/date changes, flow selection, theme/chart measurements, saved-view CRUD and attempted saves (including failures), CSV initiation, diagnostic-export initiation, and order inspection/sorting. Neither search inputs nor specific filter values, record IDs, category names, or saved-view names are stored.
- Error/fatal events record the latest user-action code and sequence **only if that action occurred within 30 seconds**, enabling local diagnostic correlation. Correlation suggests temporal proximity, **not causality**. Detailed exception messages, URLs and stacks are intentionally excluded.
- Diagnostics displays the anonymous session label, session start time, activity/error counts, error timeline with recent-action association, and the latest 25 activity/system entries. Exported diagnostics JSON includes the safe session and activity data.
- **Clear events** removes session event history from memory and the tab's `sessionStorage` while retaining the anonymous session label.

## Acceptance checks

1. Open Diagnostics; verify anonymous session ID and start time, with no identifiable user fields.
2. Change a seller-state checkbox, select a Sankey flow, change a measurement and export a CSV. Check that the latest activity codes appear in Diagnostics.
3. Reload the page in the same tab: activity history and anonymous session label persist if `sessionStorage` is available; no raw records/IDs appear.
4. Simulate a failure after an interaction: the error entry shows a stable error code, area, and recently preceding action (within 30s). It must not expose raw error text.
5. Clear events, verify no history remains, and verify failed/blocked browser storage does not break dashboard interactions.
6. Run `npm run typecheck`, `npm test`, `npm run test:node`, `npm run build` before merging or committing.

## Privacy note

The diagnostic export is user-initiated and stays local. It does reveal **what kinds of dashboard actions occurred and when**, so anyone receiving the exported file could infer behavior during the session; handle exported diagnostics accordingly. No authenticated user identity is available in this application.
