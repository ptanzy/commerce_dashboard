WU-08 Developer Investigation — Collapsible UI patch

Apply AFTER commerce_dashboard_WU08_developer_investigation_patch.zip and the
WU-08 recovery test fixes, if used. Extract into the repository root and allow
these three paths to overwrite the existing files:

- src/components/DeveloperIncidentPanel.tsx
- src/styles/index.css
- tests/ui/wu08_investigation.test.tsx

Changes:
- Click the investigation header to collapse/expand the entire section.
- Click an incident report heading to collapse/expand its findings independently.
- Retains selected incident, generated report, and expanded hypothesis details.
- Includes keyboard-accessible buttons with aria-expanded and aria-controls.
- Adds two React regression tests; no changes to analytics or recovery logic.

Acceptance:
  npm run typecheck
  npm test
  npm run test:node
  npm run build

Browser: open Diagnostics, investigate a known incident, collapse findings,
expand, collapse entire investigation, expand. Verify the previous report remains.
