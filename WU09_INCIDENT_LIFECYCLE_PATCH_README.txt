WU-09 FOLLOW-UP PATCH — Recovered Incident Lifecycle
===================================================
Apply by extracting this ZIP into the root of your existing commerce_dashboard checkout.
Overwrite the listed files only. This is NOT a full repository replacement.
DO NOT commit until browser acceptance is complete.

Changed/new files:
  src/observability/investigation.ts
  src/components/DeveloperIncidentPanel.tsx
  src/styles/index.css
  tests/incident_lifecycle.node.cjs  (new)
  tests/ui/wu09_incident_lifecycle.test.tsx  (new)
  package.json  (adds one explicit Node test to test:node)
  WU09_INCIDENT_LIFECYCLE_PATCH_README.txt  (new)

Behavior:
- Subsystem-specific success (DATASET_LOADED, GEOGRAPHY_LOADED, CSV_EXPORTED,
  render RECOVERY_VERIFIED) starts a 60s confirmation window after latest failure.
- A matching new failure inside that window reopens the active episode.
- At 60 seconds with no further matching failure, the completed episode moves to
  History and the active count drops. A later recurrence gets a new active episode
  while the prior recovered episode remains in bounded history.
- When active count = 0 the investigation section defaults to collapsed; a
  deliberate manual expansion takes priority until changed.
- History is reachable from a small control even while the panel is collapsed.
- Existing incident report conclusions stay root-cause-unconfirmed.
- No additional telemetry, permanent storage or raw error text collection.

Architecture caveats:
- History is reconstructed from the existing bounded (200-event) session log,
  persisted in sessionStorage by the existing WU-08 diagnostics module.
- Clearing event history or losing earlier events to the cap removes corresponding
  episode history. History is not durable across new browser sessions.
- The React timer updates presentation only; confirmation is calculated from
  logged timestamps and recomputed after refresh. Browser timer throttling may
  delay a visible transition until a focus/visibility event.
- Fingerprinting is the existing error code + area scheme; a success is never
  considered root-cause proof.

Run in Windows PowerShell from repository root:
  npm run typecheck
  npm test
  npm run test:node
  npm run test:security
  python -m unittest discover -s tests -p 'test_*.py' -v
  npm run security:static
  npm run build

Adversarial browser gate:
1) Open Diagnostics without errors. Investigation section should start compact
   and indicate zero active incidents. Expand it manually; active view empty.
2) Block brazil-states.topojson in DevTools and reload. Verify one active map
   geography incident appears. Investigate it, then unblock/retry the map.
3) Immediately after success, report says recovery observed, not recovered.
4) Wait 60 seconds without another failure: active count zero, compact panel,
   history link visible. Open history, investigate and confirm root cause remains
   unconfirmed, with recovery observed/confirmed timestamps.
5) Repeat the failure and unblock/retry, then reblock/retry within the 60s
   grace window. Confirm the incident stays active and occurrence count grows.
6) Allow another successful recovery to archive. Reintroduce failure after 60s;
   verify both the historical episode and new active episode are available.
7) Check manual section expansion remains open on recovery, and the independent
   collapse/expand of the findings still works. Test keyboard and both themes.

Executed in patch-construction environment:
  TypeScript Node compilation: PASS
  All 86 Node tests: PASS (includes 7 new lifecycle tests)
  Python tests: 22 PASS, 1 SKIP (DuckDB unavailable)
  Source-only security guardrail: PASS (49 files, no findings)
  TypeScript JSX syntax parse: PASS
Not executed here: npm typecheck, React/Vitest suite, full Vite production build,
real browser/keyboard visual acceptance, because node_modules were excluded from
source archive and npm offline cache could not restore dependencies.
