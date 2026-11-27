# WU-11 — Custom Dashboards and Saved Layouts

**Status:** Phases 1–3 implemented and locally accepted; Phase 4 ordering, chart-state restoration, and unified workspace UI implemented, **pending local React/build and browser acceptance**. Phase 5 final release gate remains pending.

## 1. Purpose and boundaries

Transform the single local Olist dashboard into a workspace supporting multiple named mini-dashboards, section visibility, section ordering, and complete analytical-state restoration. Preserve existing WU-05/06/07 selector semantics, WU-08/09 diagnostics/security, and WU-10 responsiveness/reliability. Reuse the existing React/D3 charts and domain calculations; **do not** create a duplicate analytics engine, backend, arbitrary user-supplied JSX, or raw-data persistence.

WU-11 is **not** the contextual-insights engine (WU-12) or the PDF/PowerPoint export system (later WUs). The saved configuration is intentionally compatible with future reporting code, but those features are not added here. Nor is this a freeform resizable grid builder; only section visibility and ordering are in scope.

## 2. Section registry and visibility ownership

Stable `DashboardSectionId` values in `src/domain/dashboardWorkspace.ts`:

| ID | Actual component / rendering boundary | Data/interaction contract |
|---|---|---|
| `kpis` | `KpiCards` | Focused cohort; order-grain KPIs |
| `periodComparison` | `PeriodComparisonPanel` | Previous equal-length interval when eligible; focused cohort |
| `geographicDistribution` | `BrazilMap` | Context without focused-flow filtering; self-dimension-excluded state view |
| `deliveryTrends` | `DeliveryTrends` | Full-history axis, focused-flow foreground where applicable |
| `shippingSankey` | `ShippingSankey` | Global cohort and focused ribbon highlights; not filtered by focus |
| `categoryLeaderboard` | `CategoryLeaderboard` | Focused cohort; item value/freight matching semantics |
| `delayDistribution` | `DelayDistributionChart` | Focused cohort; calendar-day differences |
| `orderExplorer` | `OrderExplorer` | Focused cohort, including zero-item orders |

A configuration lists **all eight** section IDs exactly once in `layout.sectionOrder`. Visibility is stored independently in `layout.hiddenSections` (subset, no duplicates); hiding a section does not erase its order. All-hidden is valid and must later yield an informative empty state. Unknown/duplicated IDs are rejected, never interpreted as code. A label change does not change a section's stable ID.

**Application-level services, not workspace panels:** `Header`, `Intro`, global `FilterPanel`, legacy `SavedViews`, focus/empty banners, `CsvExportButton`, developer diagnostics, data provenance footnote and error/recovery boundaries. Charts render in structural grids only; fixed numbered narrative group headings have been removed because they become misleading when sections are reordered. The chart/card titles remain available and independently labeled. Diagnostics must remain accessible even if analytical panels are hidden.

In Phase 2, conditionally **unmount** hidden visualization components (not `display:none` only) and avoid their chart-specific computation where possible; preserve the current shared cohort/selector semantics. Important: unmounted components lose local state, so the controlled chart preferences in §3 must be wired before switching can claim complete restoration.

## 3. Dashboard definition v1

Source of truth: `src/domain/dashboardWorkspace.ts` (canonical types and validation). The definition contains only display and analytical preferences, never Olist order/item rows or calculated metric values.

```
DashboardDefinition {
  schemaVersion: 1;
  id: string;                      // [A-Za-z0-9_-], 1–64, not reserved ID
  name: string;                    // trimmed, 1–60 printable characters
  layout: {
    sectionOrder: DashboardSectionId[]; // permutation of all eight IDs
    hiddenSections: DashboardSectionId[];
  };
  analysis: {
    filters: Filters;              // validated through WU-07 readFilterSnapshot
    views: {
      geographic: {mode:'origin'|'destination', metric:'orders'|'onTime'|'median'};
      sankey: {measure:'items'|'freight'|'value'};
      trends: {measure:'orders'|'onTime'};
      category: {measure:'orders'|'value'|'freight'|'onTime'};
    };
  };
  updatedAt: string;              // exact ISO 8601 UTC millisecond timestamp
}
```

The default values match the current app: all sections visible, unbounded dates, no filter/focus, seller-origin map / order volume, Sankey by item count, order-volume trends and category ranking. Interactions keep all WU-07 OR-within/AND-across semantics, matching seller/category on the **same item** and treating focused flows as exact directed pairs.

**The canonical full dashboard** is a virtual, immutable built-in with reserved ID `full-dashboard`. It cannot be renamed, deleted, imported as a custom dashboard, or overwritten in storage; its factory provides fresh independent arrays. To customize it, the user creates a copy under a different ID. The sentinel `updatedAt` on the virtual default is not a real modification time.

## 4. Workspace snapshot and persistence

```
DashboardWorkspaceSnapshot {
  schemaVersion: 1;
  activeDashboardId: string;      // full-dashboard or a saved custom ID
  dashboards: DashboardDefinition[]; // user-defined only, max 20
}
```

Separate browser-only storage key: `commerce-dashboard:wu11-workspaces:v1`. Existing WU-07 saved filter views under `commerce-dashboard:wu07-filter-views:v1` stay intact and independently usable, with their 12-view limit unchanged. WU-11 storage does not contain a shadow copy of the full dashboard and does not duplicate raw datasets, indexes, KPIs or order rows.

Storage limits: max 20 named dashboards, max 60 printable characters per name, max 512,000 UTF-16 code units for the JSON payload. Reject invalid structures, identifiers, control characters, unknown schema versions, unknown section IDs, unknown metric values and unsupported nested fields. Duplicate IDs or case-insensitive duplicate names, malformed individual dashboards: ignore that one record on load, keep remaining valid records, and revert an invalid `activeDashboardId` to the full dashboard. **Do not silently persist these repairs.** A write must reject such partially invalid structures rather than quietly drop records.

`readDashboardWorkspaceStorage` and `writeDashboardWorkspaceStorage` accept a minimal injected storage interface for deterministic Node testing. Storage unavailable, malformed JSON, oversize data and unsupported schema version must never crash the dashboard or destroy the original value. An unknown/newer version remains untouched pending an explicit migration decision. Keep storage access behind the app-level service. A future JSON importer should reuse the exact validator, not create a second schema interpretation.

**Cross-tab behavior for Phase 3:** handle `storage` events as remote changes with an explicit conflict/refresh notice, rather than silently overwriting unsaved drafts. If browser storage is denied/full, notify the user and keep transient work until explicitly dismissed; never claim a save succeeded. Never send configurations to a server.

## 5. Relationship to existing saved filter views

Preserve the existing Save / Load / Rename / Delete UI in `SavedViews`. A dashboard's `analysis.filters` **copies** a saved view snapshot; it does not store a fragile reference to a saved-view ID. Loading a filter view into a dashboard only changes filters and focused flows, not visible sections or chart metric preferences. Deleting or renaming a saved filter view does not mutate saved dashboards.

For dashboard load/switch in Phase 3, dispatch `restore_filters` to the shared reducer and atomically apply the controlled chart preferences. Use the existing reducer to reconcile any now-incompatible focused flows. There is one shared analytical filter context per dashboard in WU-11; no per-widget independent filters or cross-dashboard sharing of live unsaved edits. Switching dashboards must not cause a transient visualization to display a mismatched filter or metric label.

**Save model decision:** Explicit Save, with a visible dirty state. Changing controls changes only the current working draft; saving captures the current values. Switching away from dirty changes requires Save / Discard / Cancel handling. Auto-save is deliberately excluded from WU-11 to prevent accidental overwriting, particularly with multiple dashboards or tabs. Duplicate derives an independent snapshot, not aliasing mutable arrays. Deleting an active dashboard returns to the protected full dashboard. Save and delete actions must not mutate historical dashboard definitions until a storage write succeeds.

## 6. Phase 2–5 implementation plan

- **Phase 2 — Configurable rendering:** Introduce workspace root/shell and an explicit `DashboardSection` registry; conditionally mount/unmount registered sections. Preserve error boundaries, banner/footnote/CSV access, analytical context, and D3 focus. Empty-state accessibility and responsive grouping. Tests with visible and hidden sections, including no hidden chart computation.
- **Phase 3 — Management and persistence UI:** Named dashboard selector, create-from-current/full, duplicate, rename, delete, explicit Save / Discard / Cancel for dirty changes; storage errors, corrupt data, cross-tab handling and import/export JSON. Preserve the virtual full dashboard. Validate untrusted JSON before making UI changes.
- **Phase 4 — Ordering and chart preferences:** Buttons for Move Up / Move Down (keyboard-accessible), optional accessible sortable drag-and-drop if justified; controlled map, Sankey, trend and category metric props/callbacks with single configuration source. No heavyweight grid-layout package or resizable panels. Test switching/restoring each possible chart metric and map perspective.
- **Phase 5 — Full regression gate:** Typecheck, React/Vitest, Node tests, Python ETL, security scan, full Olist reconciliation, benchmark and production build. Browser test on both themes, full data, narrow/desktop views, direct interactions, all-hidden layout, bad imported JSON, disabled storage, cross-tab edits, saved filter view compatibility, and repeated switching. Preserve WU-10 responsiveness; no unneeded renders of hidden panels.

## 6A. Phase 2 implementation and acceptance contract

- `src/app/DashboardSections.tsx` provides the fixed rendering registry. Only IDs appearing in `visibleDashboardSections(definition)` render. `src/domain/dashboardSectionLayout.ts` coalesces *adjacent* chart/advanced panels without rearranging a saved order; a future Phase 4 reorder may move a section across groups.
- `src/components/DashboardSectionCustomizer.tsx` exposes accessible checkbox visibility controls. During this phase these affect only a **transient preview** of the virtual Full Dashboard; no `commerce-dashboard:wu11-workspaces:v1` storage writes occur. The canonical Full Dashboard remains immutable, refresh returns to all visible sections, and explicit Save/Load is deferred to Phase 3.
- All-hidden is valid and displays a clear empty state. Global filters, WU-07 saved filter views, empty/focus banners, CSV export, diagnostics, and the data footnote remain available independently of section visibility. The `View matching orders` link appears only if the Explorer is visible.
- Hidden components are truly unmounted; their chart-local calculations/effects do not run. Shared cohort/metrics calculations still run when needed by the global filter count and CSV export. Rendering skips unsupported arbitrary user-provided component definitions.
- **Temporary limitation:** unmounting chart components discards their private metric/tab selection, even though shared filters and focused flows remain. Phase 4 introduces controlled view preferences for complete restoration before the full saved-dashboard workflow is considered finished. Don't claim complete chart-state restoration in Phase 2.
- Local acceptance: typecheck, `npm test -- --maxWorkers=1 --no-file-parallelism`, Node regressions, production build; browser checks for all eight section toggles, full/partial/all-hidden layouts, filters/Sankey focus retention, themes, narrow viewports, independent CSV/diagnostics, and no workspace-storage writes. Keep WU-11 uncommitted until release acceptance.

## 7. Phase 1 acceptance / precise exclusions

Phase 1 adds the pure data model, default factory, validator, read/write storage adapter, Node tests and this specification. **It does not render or activate custom dashboards yet.** The current UI continues to operate exactly as before and does not write the new storage key automatically.

Acceptance for this phase: compile the new domain/storage modules, run their deterministic Node tests, and run the existing checks when dependencies are available. Report any tests not run. No public data/assets added, no new runtime dependency, and no commits/pushes from an assistant patch. Owner validates integration and commits at the appropriate release gate.

## 8. Future interoperability

WU-12 can analyze visible sections against the shared selector/context engine; it should return evidence-bearing findings separately from the layout definition. WU-13/14 should generate PDF/PowerPoint from a frozen validated dashboard snapshot, not by scraping chart UI state or placing results in the saved configuration. Presentation detail levels and report methodology are future export preferences, **not** fields of v1 workspace storage.

## 6B. Phase 3 implementation note

The named workspace UI, explicit Save/Discard/Cancel, and JSON import/export are specified in `docs/WU11_PHASE3_NAMED_DASHBOARDS.md`. Phase 2C's independent Delivery Trends vertical sizing change must be preserved when applying Phase 3. The chart-specific metric settings remain deferred to Phase 4. Schema v1's `layout.filterPanelVisible` may be absent in Phase 1 snapshots and defaults to true during validation; new snapshots include it.

## Phase 4 UI consolidation (2026-11-26)

- `DashboardWorkspaceControls` owns the sole visible management/editing panel. When collapsed, its header shows the active dashboard, visible-section count and unsaved indicator. It is above `ActiveFilterContext`, which remains independent and always accessible. Expanded state uses the optional, session-scoped `sessionStorage` key `commerce-dashboard:wu11-workspace-open:v1` (no change to workspace JSON schema). Storage failures default safely to collapsed.
- `DashboardSectionCustomizer` is rendered **inside** the expanded workspace as one ordered list. Each row has a visibility checkbox, its position, a drag handle and keyboard-accessible Up/Down buttons. Hidden sections remain in the ordered list, subdued; toggling visibility does not clear filters or chart preferences. The distinct checkbox grid and separate layout-editor panel were removed.
- The numbered story headings (`01 / PERFORMANCE OVERVIEW`, `02 / EXPLORE THE PATTERNS`, `03 / DEEPER DELIVERY INTELLIGENCE`, `03 / INSPECT THE RECORDS`) and their large narrative titles are removed from analytical content. Panels retain independent, accessible titles; the Sankey's **View matching orders** anchor remains functional; chart grids and the Phase 2C paired-trend height contract remain intact.
- The existing protected Full Dashboard, named dashboard Save/Discard/Cancel, cross-tab guard, import/export validation, hide-only active-filter toasts, filter state and diagnostics must not change. Test collapsed/expanded state, session memory, combined hide/move, reordered groups, and absence of obsolete headings in addition to all prior WU-11 checks.
