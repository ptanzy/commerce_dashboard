# WU-11 Phase 4 — Section ordering and chart preference persistence

## Scope and decisions

Phase 4 extends the Phase 3 named-dashboard manager. It does **not** introduce server persistence, PDF/PowerPoint, insights, or resizable freeform widgets.

- The section editor offers Move Up / Move Down buttons for all eight sections, including hidden ones, plus optional mouse drag-and-drop. Keyboard buttons remain the primary fully accessible path; the ordered list announces moves. Only a complete, validated permutation can be saved.
- Saving a dashboard stores the order, visibility, full filter-panel visibility, shared filters/focused flows, and four chart preferences in the existing schema v1. No schema migration or duplicated data is needed.
- Map: origin/destination and order volume/on-time rate/median delivery; Sankey: item count, freight, item value; trends: order volume/on-time rate; category leaderboard: distinct orders, item value, freight, on-time rate.
- All four visualization choices are owned by the active draft, not individual chart mounts. Hidden charts retain their choices. Returning to another dashboard restores its independent values. Transient hover and UI tooltips are not persisted.
- Changes to chart tabs or layout order mark a **custom** dashboard dirty. Save persists; Discard restores the last saved layout and chart preferences; switching dirty dashboards follows the existing Save / Discard / Cancel gate. The built-in Full Dashboard remains immutable and can only be customized by creating a named copy.
- The existing saved-filter-view UI remains separate; loading one changes shared filters and focused flows only, not chart tabs or layout. Hiding a chart never silently clears filters.
- The Sankey maintains fast tab feedback and labels stale results using the actually computed measure during its short deferred recalculation. Its focused-flow semantics are unchanged.
- Editing one view should not needlessly rerender unrelated memoized charts; stable chart callbacks preserve WU-10 memoization.

## Automated acceptance

From `commerce_dashboard` on Windows:

```powershell
npm run typecheck
npm test -- --maxWorkers=1 --no-file-parallelism
npm run test:node
python -m unittest discover -s tests -p 'test_*.py' -v
npm run security:static
npm run build
```

Node: `tests/dashboard_workspace_phase4.node.cjs`. React: `tests/ui/wu11_layout_preferences.test.tsx`.

## Browser acceptance

1. Open section editor. Use Move Up/Down and optional drag/drop; check the actual dashboard section order, including moving KPIs, maps, and advanced cards across groups. Verify no duplicate cards or headers and no loss of filter context.
2. Hide a section, reorder it, show it again; its position should be preserved. The All Sections control should restore visibility without resetting order.
3. Create dashboard A with Destinations + Median delivery, Sankey Freight, Trend On-time and Category Item value. Save. Create dashboard B with different tabs and section order. Switch A↔B; selections, order, and active filters must restore exactly.
4. Modify a custom dashboard's tab and order. Verify dirty warning; Cancel switch retains draft, Discard restores saved values, Save persists. Refresh and verify persistence.
5. Hide the Sankey with focused flows and hide the filter panel with active filters. Active-filter disclosure and hide-only notice must still work; KPIs and CSV must continue to reflect the same cohort.
6. Test with all sections hidden, empty cohorts, dark/light themes, mobile width, keyboard Tab focus, and with the full Olist dataset. Repeated tab switching should remain responsive.
7. Export dashboard JSON, import as a new dashboard, and confirm order and four chart preferences survive. Reject malformed JSON and unknown section/metric IDs.
8. Inspect console for unexpected errors and verify existing developer incident/recovery controls and the original saved filter views.

## Release boundary

All implementation changes remain **uncommitted** until owner acceptance. Phase 5 performs full release regression and staging review. The standalone app cannot run React/Vitest without local dependencies; Node/ETL/security checks may run independently.
