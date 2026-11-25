WU-09 Sankey Ctrl/Cmd-click reliability fix

Apply AFTER the WU-08 commit and WU-09 security overlay.
Unzip into C:\Users\ptanz\job_search\commerce_dashboard, keeping directories.
Only 2 application/test files are replaced; no global filters, saved views,
datasets, or analytical selectors are modified.

Changes:
- Render the ribbons visually unchanged, but delegate clicks to a wider,
  transparent SVG hit target that is layered AFTER the nodes and labels.
- The hit target handles Ctrl/Cmd-click additive toggling, ordinary click
  replacement, and keyboard Enter/Space operation.
- The existing accessible list below the Sankey continues to toggle flows
  without modifier keys.
- Add a regression test for ribbon click, Ctrl/Cmd-click, plain-click,
  and Ctrl+Enter, verifying the distinct order KPI and ARIA state.

Validation in Windows PowerShell:
 npm run typecheck
 npm test
 npm run test:node
 npm run test:security
 npm run build

Manual browser check (Edge):
 1) Clear Sankey focus and any unrelated global filters.
 2) Click an SVG ribbon; verify 1 focused flow.
 3) Hold Ctrl while clicking a DIFFERENT SVG ribbon; verify 2 focused flows.
 4) Ctrl-click an already focused ribbon; it should be removed.
 5) Plain-click a different ribbon; it should become the only focused flow.
 6) Try the list of flow buttons below the diagram; they should toggle
    selections independently without Ctrl.
 7) Verify the filter bar summary and the Sankey individual chips agree.

Full React tests and real-browser verification must run in the Windows checkout.
