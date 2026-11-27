# WU-11 Phase 3 — Named Dashboard Management

## Scope and contract

WU-11 Phase 3 builds on the Phase 1 validated workspace definitions and the Phase 2B visibility/filter-context UI. It adds a **client-only** workspace manager: create a new dashboard from the current draft or the protected Full Dashboard, duplicate current, rename, delete, select, explicit Save, Discard, JSON export/import, and restoration after reload. There is **no server write**, no change to Olist datasets, and no arbitrary user-rendered UI.

The Full Dashboard remains immutable as a saved definition. The user may customize its *transient preview* and create a new dashboard to preserve it. Named dashboard switches restore their own validated filter snapshots and section visibility; the filter panel can be hidden without altering analytical filters. The compact active-filter disclosure and hide-only notification semantics from Phase 2B remain in force. Switching dashboards does not clear the independent WU-07 saved filter views.

## Data model and backward compatibility

Schema v1 now allows an optional `layout.filterPanelVisible` boolean for pre-Phase-3 storage compatibility. New definitions always write it explicitly; legacy Phase 1 definitions without the property normalize to `true` **in memory only**. Unknown versions, unknown fields, malformed entries and bad imports are not executed. The existing strict versioned key and bounds remain unchanged. Maximum twenty custom dashboards, 60-character names, strict unique names (case-insensitive), reserved Full Dashboard identifier, and 512,000 UTF-16-character JSON storage cap continue to apply.

The workspace manager uses `readDashboardWorkspaceStorage` / `writeDashboardWorkspaceStorage`; writes are explicit and only update in-memory committed state on storage success. A denied, malformed, or newer-version storage value blocks writes instead of overwriting it. A separate-tab `storage` event produces a conflict warning and blocks further writes until the user chooses to reload; it never silently discards unsaved drafts. Reload while dirty is refused with an explanation. This is intentionally conservative for the local POC.

## Dirty-state and selection rules

- Layout visibility, filter-control-panel visibility, and **all shared filter/focused-flow changes** are part of the working draft and contribute to its dirty flag.
- Saving a custom dashboard persists its current draft. `Discard changes` restores that dashboard's stored definition and filters. The protected Full Dashboard cannot be saved in place.
- Switching away with a dirty draft requires **Save and switch**, **Discard and switch**, or **Cancel**. Full Dashboard users see Discard/Cancel, with New/Duplicate available for saving a copy.
- Saving followed by switching is one atomic workspace storage write; failures retain the active UI and draft.
- Creating from current and duplicating explicitly preserve the current draft as a new independent named dashboard. Deleting needs explicit confirmation and returns to Full Dashboard.
- A selected dashboard is remembered through reload. All missing/invalid active IDs fall back to Full Dashboard without modifying storage.
- JSON export emits only a validated dashboard definition and no data rows. Import strictly validates before generating a new local ID and unique name. A dirty draft must be saved or discarded before import.

## Deferred to Phase 4

Metric/tab preferences for Geographic Distribution, Sankey, Trends and Category are still internal to those chart components. Phase 3 validates/stores the fields but **cannot yet capture and restore live chart-specific tab changes**. A dashboard switch resets chart components; Phase 4 will introduce controlled view props and callbacks. Phase 4 will also add accessible Move Up / Move Down section ordering. Phase 3 intentionally does **not** add a draggable/resizable grid.

## Browser acceptance

1. Create a dashboard named Logistics from the current section/flow-filter selection. Refresh and confirm exact visible sections and directed-flow filter are restored.
2. Hide filter controls, save, refresh; confirm filter panel remains hidden and the compact context disclosure is available. Hidden controls must not clear filters.
3. Edit a named dashboard, attempt switching, then test Cancel, Discard and Save paths. Verify unsaved changes never silently disappear.
4. Create a dashboard from Full Dashboard, duplicate it, rename it, then delete one; verify Full Dashboard remains protected and intact.
5. Test JSON export/import on a separate browser origin; check corrupted or unknown-version JSON is rejected with no data loss.
6. Open a second tab, change saved workspace there, then confirm the first tab warns and offers explicit refresh instead of overwriting changes.
7. With storage denied/full, attempt Save/Create and confirm truthful failure without claiming persistence. Ensure saved WU-07 filter views remain unchanged.
8. Verify responsiveness with the complete Olist dataset, both themes, screen-reader labels, keyboard controls, and the narrow-layout display.

Run `npm run typecheck`, `npm test -- --maxWorkers=1 --no-file-parallelism`, `npm run test:node`, `python -m unittest discover -s tests -p 'test_*.py'`, `npm run security:static`, and `npm run build` before acceptance. Do not commit until the local gate passes.
