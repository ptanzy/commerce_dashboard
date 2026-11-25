Commerce Delivery Intelligence — WU-08 developer investigation extension
=======================================================================

PREREQUISITES
- WU-07 committed, and all FOUR WU-08 overlays already applied in order:
  1. commerce_dashboard_WU08_implementation.zip
  2. commerce_dashboard_WU08_session_activity_patch.zip
  3. commerce_dashboard_WU08_diagnostics_completion_patch.zip
  4. commerce_dashboard_WU08_recovery_engine_patch.zip
- Apply commerce_dashboard_WU08_recovery_test_fixes.zip if not already applied.

INSTALL
Extract THIS ZIP into the repository root, preserving directories and
replacing only the matching files. No dependency installation is required
by this patch; package.json only adds the investigation Node test entry.
Do not commit generated assets under public/data/ or raw datasets.

CHECKS (PowerShell)
  cd C:\Users\ptanz\job_search\commerce_dashboard
  npm run typecheck
  npm test
  npm run test:node
  npm run build
  npm run dev

EXPECTATIONS
- The Node suite increases from 65 to 72 tests.
- Three additional React/Vitest regression tests are included. The full
  React suite and Vite build must be verified on the Windows checkout.
- Diagnostics -> Developer incident investigation appears under Recovery Center.
- Investigate and check health runs non-destructive health checks, creates
  a hypothesis report, and explicitly leaves the root cause unconfirmed.
- Report exports are local .md or .json downloads, NOT auto-submitted.
- Read docs/WU08_INVESTIGATION_ADDENDUM.md and the labeled synthetic sample.

UNCHANGED
- No filtering/Sankey semantics, analytics selectors, datasets, repair
  registry, retry limits, external logging, or remote telemetry changed.

PRIVACY
Error traces and raw exception text are NOT exported. Incident suggestions
are limited by the existing sanitized event trail. Review exported reports
before sending them to a developer.
