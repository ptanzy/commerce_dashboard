> **SYNTHETIC EXAMPLE ONLY.** All session events, numbers, build data, timings and incident details below were fabricated to demonstrate the report format. This is not an actual dashboard incident.

# Developer incident: Dashboard section rendering failure

- Incident fingerprint: `RENDER_FAILED:sankey`
- Generated: 2026-11-25T02:37:20.546Z
- Status: unresolved | Severity: fatal
- Occurrences in retained history: 1
- First observed: 2026-11-25T02:37:20.545Z
- Last observed: 2026-11-25T02:37:20.545Z
- Anonymous session: s-07dc3ecf84ac8ff4
- Application version: 0.6.0 | Commit: 0123456789abcdef | Mode: test
- Runtime: Edge / Windows
- Data schema: unknown | Processing version: unavailable

## Assessment
**Root cause: unconfirmed.** This is an offline, deterministic hypothesis review—not autonomous code analysis or a verified diagnosis.
Related action: SANKEY_MEASURE_CHANGED (#1; temporal association only).
Health at report time: dataset=ready, geography=ready, browser_storage=pending.

## Error-time configuration
Eligible orders: 84; selected origins: 3; selected destinations: 4; selected categories: 1; focused flows: 2; date filtered: true.
Chart modes: mapMode=origin, mapMeasure=orders, trendMeasure=orders, sankeyMeasure=freight, categoryMeasure=orders.

## Health checks (at investigation time)
- No explicit health-check results are available.

## Related operation traces
- 2026-11-25T02:37:20.545Z: sankey_layout 820.00 ms (slow) after SANKEY_MEASURE_CHANGED (#1; correlation only)

## Possible causes and troubleshooting

### 1. Visualization data or layout edge case
Assessment: supported-by-context.

Supporting context:
- Sankey measure at the last recorded rendering failure: freight.
- A Sankey interaction occurred within 30 seconds before the error; temporal association only.
- A related component operation exceeded its provisional slow-operation threshold near the error.
Tests to distinguish this cause:
1. Reproduce with the affected global filter scope and focused-flow count, if available.
2. Switch chart measurement and compare whether the failure is specific to one mode.
3. Run relevant selector/chart regression tests, including zero-item, null-amount, and directed-pair cases.
Confirm if: A specific, reproducible dataset shape or chart mode triggers the failure in an isolated regression test.
Weaken if: The component fails with a minimal valid fixture independently of the data or chart mode.

### 2. UI render lifecycle or browser compatibility problem
Assessment: supported-by-context.

Supporting context:
- A related component operation exceeded its provisional slow-operation threshold near the error.
Tests to distinguish this cause:
1. Check the browser developer console locally for the exception class and component stack; review sensitive content before sharing.
2. Compare behavior in an unmodified supported browser and a clean profile.
3. Inspect the affected React component and retry/isolation lifecycle; add a regression test for the reproducible case.
Confirm if: The failure is reproduced by a particular render/lifecycle transition or browser condition and corrected by a targeted change.
Weaken if: The failure occurs entirely in data preparation before the component mounts.

### 3. Unhandled asynchronous operation, abort race, or stale result
Assessment: plausible-unverified.

Supporting context:
- No distinctive supporting evidence recorded.
Tests to distinguish this cause:
1. Inspect the rejected promise locally in Developer Tools without exporting sensitive exception text.
2. Test rapid changes of filters and chart modes, route reloads, and component unmounts.
3. Audit asynchronous requests for AbortSignal handling, stale-success handling, and explicit catch paths.
Confirm if: A specific rejected operation or stale result is reproduced and no longer rejects after the handler is corrected.
Weaken if: All asynchronous operations settle normally and the failure is synchronous in a component.

## Recovery attempts
- None recorded for this incident.

## Nearby evidence
- 2026-11-25T02:37:20.545Z: during · info · sankey/SANKEY_MEASURE_CHANGED
- 2026-11-25T02:37:20.545Z: during · warn · app/OPERATION_SLOW
- 2026-11-25T02:37:20.545Z: during · fatal · sankey/RENDER_FAILED

## Suggested source entry points (not confirmed defective)
- `src/charts/ShippingSankey.tsx`
- `src/domain/selectors.ts`
- `src/domain/exploration.ts`

## Recommended next actions
1. The issue is unresolved or unverified; investigate the first hypothesis using its confirmation and disconfirmation checks.
2. Reproduce safely on the same application version and a known validated local dataset.
3. Record which checks confirm or refute each cause. Do not label a root cause confirmed without a reproducible result.
4. If needed, inspect the original exception locally and share only a reviewed, redacted excerpt.
5. Run relevant regression tests, typecheck and production build after a fix; repeat the original failure scenario.

## Evidence limitations
- No raw exception, stack trace, error message, user identity, URL, or source record is collected automatically.
- The available error history is bounded to the most recent 200 events and may omit earlier failures.
- Correlation with a preceding action or slow operation does not establish causation.
- Latest health checks reflect inspection time, not necessarily the moment of failure.
- No explicit health-check run is available for this session.

## Privacy and escalation
No report is transmitted automatically. Review the JSON diagnostic bundle and any manually gathered console data before sharing.
