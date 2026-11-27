# WU-11 Phase 4 refinement — Unified Filters & Views

## Goal
Replace three independent vertical surfaces — **Filters Active**, **Refine your view**, and **Saved views** — with a single collapsible **Filters & Views** panel directly beneath **Dashboard Workspace** and above the analytical panels. This is a UI consolidation only. It does not change the cohort model, filter semantics, saved view schema, dashboard workspace schema, or chart selection semantics.

## Interaction contract

- The Filters & Views panel starts collapsed. Its header always displays the active filter **count** and current matching-order **count**, including directed Sankey flow selections.
- The active filter summary remains independently expandable and editable even when the full Filters & Views controls are collapsed; individual focused flows and global filters can be removed there.
- Expanding Filters & Views shows the existing full filter UI, unless the active dashboard explicitly hides full filter controls. In that case the active summary and saved filter view tools remain accessible, and **Show filter controls** restores the full controls by changing the current dashboard draft. This action does not clear any filters.
- **Saved filter views** form a nested disclosure inside Filters & Views. They continue using their pre-existing browser-only saved-view storage key and 12-view limit, entirely separate from named dashboard storage. The header reflects the stored count.
- Collapsing the outer panel changes visibility only, not any filter selection, draft dashboard state, in-progress saved-view name or selected preset. It does not generate a hide-warning toast. Toasts remain reserved for hiding a *source section* whose active filter remains in effect, or explicitly hiding the full filter controls in the workspace layout editor.
- A responsive single panel should not display three nested cards/borders. The original inner filter and saved-view functions remain available for regression coverage, but have borderless styling when embedded.

## Acceptance checks

1. Dashboard Workspace is above Filters & Views; there are no standalone Filters Active, Refine your view or Saved views cards.
2. With all filters clear, the collapsed Filters & Views header reads **0 active**, **No filters active**, and the current total order count.
3. Select seller origin SP using the expanded controls. Collapse Filters & Views. The KPIs remain filtered, **1 active** appears, and the Filters Active disclosure can remove SP without reopening the panel.
4. Select a Sankey directed flow and collapse the entire filter panel. The focused-flow constraint still affects KPIs. Its exact directed pair can still be seen and removed from Filters Active.
5. Expand the panel and expand **Saved filter views**. Save a preset, change filters, load the preset, rename, and delete. Check that the UI reports the correct N/12 count. Existing custom dashboards remain intact.
6. In a named dashboard, use the workspace layout editor to hide the full filter controls. The Filters & Views header and active summary remain available. Expanding still allows accessing saved views; **Show filter controls** restores filtering controls without clearing the analytical cohort. Check Save/Discard for the changed visibility setting.
7. Collapse with a partially typed saved preset name, then reopen. The name is unchanged and no browser storage write happened merely from collapsing.
8. Test dark/light themes, narrow/mobile layout, interactions with open multiselects, dashboard switching/refresh and rapid filter selection. The warning toast must NOT appear on a normal panel collapse.

## Local release gate

```powershell
npm run typecheck
npm test -- --maxWorkers=1 --no-file-parallelism
npm run test:node
npm run build
npm run dev
```

The automated tests under `tests/ui/wu11_filters_views.test.tsx` supplement the existing filter, saved-view, Sankey, workspace, and security tests. This patch does not change any backend code or dataset artifacts.
