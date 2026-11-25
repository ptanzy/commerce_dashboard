# WU-08 Addendum — Developer Incident Investigation and Escalation

This is an interim engineering handoff, **not** the final WU-N documentation.

## Context and inspiration

Investigation patterns were adapted from product documentation (not proprietary implementation):

- **Sentry** — issue fingerprinting, exception breadcrumbs, suspect-commit context: https://docs.sentry.io/product/issues/issue-details/
- **Datadog Bits Investigation** — evidence-backed competing hypotheses, hypothesis trees, explicit inconclusive outcomes: https://docs.datadoghq.com/bits_ai/bits_investigation/investigate_issues/
- **Dynatrace Problems** — correlated problems, failure analysis and component focus: https://docs.dynatrace.com/docs/dynatrace-intelligence/problems-app
- **New Relic Errors Inbox** — error grouping, nearby log context and distinct error profiles: https://docs.newrelic.com/docs/triage-inbox/errors-inbox/
- **Grafana Investigations** — iterative diagnostics and suggested checks: https://grafana.com/docs/grafana-cloud/platform/grafana-assistant/platform/investigation/
- **Azure Monitor investigation** — summarized findings, evidence and next steps: https://learn.microsoft.com/en-us/azure/azure-monitor/aiops/observability-agent-deep-investigations
- **OpenTelemetry** — event semantic conventions and sensitivity of exception data: https://opentelemetry.io/docs/specs/semconv/general/events/

## Design and files

New engine `src/observability/investigation.ts` uses the existing WU-08 `DiagnosticSnapshot` and active recovery issues, without changing the data selectors or repair behavior.

New UI `src/components/DeveloperIncidentPanel.tsx` is placed in Diagnostics after the Recovery Center. The user selects an incident, clicks **Investigate and check health**, and can expand candidate hypotheses. Health checks are non-destructive. Two locally generated exports are available: a readable Markdown investigation and a JSON bundle with the allowlisted evidence already retained by diagnostics. Neither is sent to a server.

Investigation functionality:

1. Fingerprint the last 200 retained error events by **allowlisted error code + subsystem** and count occurrences.
2. Identify an issue as *unresolved*, *recovery observed*, or *not confirmed active* (not a proof of root-cause repair).
3. Capture the latest incident's sanitized error-time state, chart choices, preceding user action, nearby operation timings, available health checks and repair attempts.
4. Select a small **deterministic** set of hypotheses specific to dataset, geography, storage, CSV, render, asynchronous or unknown runtime failures.
5. Rank contextual signals above general possibilities. The ranking is **not** an AI probability estimate.
6. For each hypothesis, give reproduction instructions, checks that **confirm** it, checks that **weaken** it, and a suggested source-code starting point.
7. Report **root cause unconfirmed**, including when a retry restores the immediate operation.

Privacy: event codes, component names, broad browser/OS family, build identity, aggregate counts and measured times only. **Never** auto-export raw Olist rows, identifiers, URLs, user-entered free text, exception messages, stack traces, session replays or screenshots. A developer may ask a user to inspect original browser errors locally and share a **reviewed, manually redacted** excerpt. Report exports require direct user interaction.

## Validation and acceptance

Automated tests: `tests/investigation.node.cjs` and `tests/ui/wu08_investigation.test.tsx`.

Run in the Windows project checkout:

```powershell
npm run typecheck
npm test
npm run test:node
npm run build
```

Manual: open Diagnostics in dark and light themes, produce or simulate a known error with a safe test fixture, click **Investigate and check health**, expand the hypothesis list, verify an unconfirmed conclusion, export Markdown and JSON, and inspect the files for sensitive values. Verify narrow viewport and keyboard navigation. Clearing event history should remove the incident from the selector. Existing WU-07 filter/Sankey behavior must remain unchanged.

Known limits: No source map/stack inspection, repository diff, live network diagnostics, screenshot capture or generative inference; a frontend-only local deployment cannot access arbitrary user files or execute Python repair scripts. Incident fingerprints can group distinct defects sharing the same code and component, and the bounded event history may miss older occurrences. A current healthy status cannot prove a prior error never occurred.
