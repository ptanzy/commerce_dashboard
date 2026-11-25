WU-08 Recovery Engine - React test selector fixes

These are test-only changes; no dashboard behavior, recovery procedures, or analytics are modified.

1. tests/ui/wu08.test.tsx
   "Apply global filters" appears in both the performance table and an operation trace.
   Change getByText to getAllByText, asserting at least one match.

2. tests/ui/wu08_recovery.test.tsx
   "Restore section" exists both in the Recovery Center and on the isolated chart placeholder.
   Scope the test action to the Recovery Center, which is the flow the test intends to exercise.

Apply:
  Extract ZIP into C:\Users\ptanz\job_search\commerce_dashboard, overwriting the 2 test files.
  npm test
  npm run typecheck
  npm run test:node
  npm run build

Baseline evidence supplied by user: 49/51 React tests passed, 65/65 Node tests passed,
production build passed, and 13/13 Python tests passed. The corrected React suite
requires local rerun; no new production code changes are needed.
