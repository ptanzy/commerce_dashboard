# WU-08: Diagnostic Recovery Engine (additive handoff)

**Scope:** User-authorized continuation of WU-08; final comprehensive docs deferred to WU-N. Apply over WU-08 implementation + session logging + diagnostics completion patches, in that order. Preserve the WU-07 two-layer filter/Sankey contract.

## Design and boundaries

- A local, deterministic **Diagnostic Recovery Center** is embedded inside the existing Diagnostics panel. It classifies fixed, allowlisted event codes: dataset/map loading, React rendering, CSV export, storage access, and unhandled app errors. It never executes arbitrary input, OS commands, or AI-generated code.
- Transient **network exceptions and HTTP 502/503/504** for static JSON and geography requests get **one** automatic retry after ~150 ms. Aborts, HTTP 404, bad JSON, corrupt topology and invalid dataset schema are **not** automatically retried. A failed second request produces the existing visible failure and guidance.
- A user can explicitly retry dataset and map loads; a fresh `pending → ready/degraded` health transition verifies the outcome, with a 12-second timeout. No stale success counts as recovered.
- A failed React section can be retried, or **isolated** so other views remain usable, and later restored. This preserves React-owned global filters and saved views. Successful remount is immediate recovery evidence, not proof that the bug cannot recur. The app-level root boundary still uses reload/manual retry.
- CSV retry explicitly reattempts the same existing local export; it logs success only when the browser download initiation completed without throwing. Actual file delivery cannot be proven by a browser-only app.
- Browser-storage checks probe tiny throwaway keys in session/local storage, and **never delete stored views**. They are labeled *checked*, not repaired, because quota failures can evade a small probe.
- Unknown browser exceptions have **escalation instructions and diagnostic export**, not a speculative repair.
- **At most two unsuccessful manual retries** per issue kind+area without an intervening verified recovery. No infinite retry loop. Actions are only executed from registered handlers for the relevant mounted component.
- Every recovery outcome is recorded in a bounded, allowlisted in-memory history exported with the diagnostics report. The ordinary session event log persists in sessionStorage; recovery-attempt details are not persisted across page reloads.
- No customer/order identifiers, free-text exceptions, URLs, session replay, remote telemetry, or uncontrolled repairs. An empty result cohort is **not** automatically classified as a failure and filters are never changed silently.

## Files

- New: `src/observability/recovery.ts`, `src/components/RecoveryCenter.tsx`, `tests/recovery.node.cjs`, `tests/ui/wu08_recovery.test.tsx`.
- Modified: diagnostics event/report types, `UiErrorBoundary`, `DiagnosticsPanel`, dataset loader, `BrazilMap`, `App`, CSV export component, styles, Node test config and script.

## Acceptance

1. Existing diagnostics open/close, health checks, event filtering, session logging, privacy and JSON export still work.
2. Missing dataset **404** gives guidance with no retry; one transient network error followed by success repairs loading automatically; persistent network errors stop after one automatic retry.
3. Map 404/topology corruption is not silently rewritten; transient network failure is retried only once; user retry reports verified status only when geography becomes ready.
4. Crash a chart in test: section shows fallback, can be isolated, other charts and filters remain unaffected, restoring remounts section and logs outcome. Two unsuccessful manual retries stop repeated attempts.
5. CSV failure is actionable and optional retry is bounded. Browser-storage checks never delete saved views or claim to repair blocked storage.
6. Diagnostic JSON includes fixed recovery records and contains no injected exception message/order ID/path.
7. Run `npm run typecheck`, `npm test`, `npm run test:node`, `npm run build`, Python test suite, and inspect light/dark/mobile layout. These full/browser checks must be completed in the owner's Windows checkout before commit.

**No Git commit or push is included in this patch.**
