# WU-11 Phase 5 — Final Release Acceptance

**Status:** Pending the owner's local automated gate and adversarial browser signoff. Completing this document, preparing the runner, or seeing source compile is **not** release acceptance. No Git commit should be made until the conditions below pass.

## Deliverable boundary

WU-11 provides independent named custom dashboards, stable section visibility/order, saved chart views, validated browser-local persistence, protected Full Dashboard, explicit Save/Discard/Cancel, combined collapsible Dashboard Workspace, combined Filters & Views, preserved Sankey/global filter focus, hide-source filter notices, and accessible controls. WU-12 analytical insights, WU-13 PDF, WU-14 PowerPoint, and WU-15 guided tours are outside WU-11.

The run below is **non-destructive with respect to source and Git**. It runs the existing tests and compilation, may update build/test output folders as the existing npm scripts normally do, and writes diagnostic logs to a **sibling folder outside the repository**. It does not stage, commit, push, install dependencies, or clear user browser storage.

## Gate A — Reproducible automated checks

From the repo root, either run the PowerShell helper:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\wu11_phase5_release_gate.ps1
```

Or run its constituent checks yourself:

```powershell
npm run typecheck
npm test -- --maxWorkers=1 --no-file-parallelism
npm run test:node
python -m unittest discover -s tests -p 'test_*.py' -q
npm run security:static
npm run build
node tests/check_olist.cjs
node tests/check_explorer.cjs
git diff --check
git status --short
```

**Release requirements:** zero TypeScript errors; *all* React/Vitest, Node and Python tests pass (document legitimate skips); source security scan has no findings; production build completes; the full Olist commands reconcile successfully. The expected count on the inspected full-source dataset is **99,441 orders, 112,650 items, 96,470 eligible punctuality orders, and 89,936 on-time deliveries**. The full-source reconciliation script only asserts fixed counts when its input archive hash matches the verified source. Otherwise preserve the actual observed results, investigate differences, and do not invent an exact match.

The user previously reported **111/111 Node tests** and **104/106 React tests** before receiving the correction to stale Filters & Views header assertions. Expected current React count is **106**, but do not claim success until rerun. Some older reconstructed snapshots available to the assistant contain fewer regression files; the owner's working checkout is authoritative.

The `npm warn Unknown user config "python"` message is not a test failure. Actual nonzero command exits are failures.

## Gate B — Adversarial browser acceptance

Use your real full local Olist data, **not only the tiny test fixtures**. Start `npm run dev`, test desktop (~1440 px) and mobile (~390 px), and toggle both dark and light themes. Use two temporary dashboards named `WU11 Acceptance A` and `WU11 Acceptance B` and a temporary filter preset, so existing user dashboards remain safe. **Don't clear all browser storage**; these tests should protect real saved configurations.

Record each case as PASS, FAIL (with reproduction steps), or NOT RUN. The gate requires every applicable case to pass.

| ID | Action | Pass condition |
|---|---|---|
| B01 | Load protected **Full Dashboard**, refresh, inspect both themes. | All eight sections render; no old numbered narrative headings; no layout or filter edits get silently persisted to the protected default. |
| B02 | Expand/collapse **Dashboard Workspace** three times, then reload tab. | Compact state initially; session expansion behavior consistent; no unwanted draft discard or writes from simply collapsing. Workspace remains above Filters & Views. |
| B03 | In Workspace, combine checkbox hide/show with drag and Up/Down; move `Order Explorer` above `Delivery trends`. | One ordered list; exact visual order matches; keyboard actions and drag work; hidden sections retain their position. |
| B04 | Hide every panel, then restore only `Delivery trends`. | Helpful all-hidden state; global controls, CSV/diagnostics accessible; no crashes or blank shell; restored panel works. |
| B05 | Put `Geographic distribution` beside `Delivery trends`; then separate them and shrink width. | Cards align on wide desktop; trend plot fills paired height without stretched labels; chart returns to natural aspect on narrow screen. |
| B06 | Create `WU11 Acceptance A` from current layout, save it, reload. | Name, section order, section visibility and chart choices persist. |
| B07 | Create `WU11 Acceptance B` with different map mode/metric, Sankey metric, trend metric and category metric. Save. | A and B switch repeatedly with *independent* view settings and no leaked state. |
| B08 | On B, make unsaved changes; select A, choose **Cancel**. Repeat using **Discard and switch**, then **Save and switch**. | Cancel keeps draft and active dashboard, Discard restores saved B, Save persists B before switching. |
| B09 | Duplicate B, rename the copy, delete it, then try to rename/delete Full Dashboard. | Copy is independent, operations work with confirmation; Full Dashboard remains protected; no saved filter presets lost. |
| B10 | Select two geographically different seller states and a category; adjust an inclusive date range. | OR within a group, AND across groups; all active filters visible in expanded compact summary; KPI and table reconcile. |
| B11 | Pick two **directed Sankey flows**, then hide Sankey using Workspace. | KPIs and Order Explorer remain focused; hidden Sankey produces one notice that filters remain applied; Filters Active identifies/removes exact directed pairs. |
| B12 | With Sankey visible, remove one focused flow through Sankey and another through Filters Active. | Both accessible actions work independently; no stale ribbon focus, duplicated candidates or unmatched KPI changes. |
| B13 | Hide geographic panel while an origin filter is active; hide full filter controls with active constraints. | Hide-source notice appears when appropriate; data remains filtered. Collapsing Filters & Views itself creates **no** hide warning. |
| B14 | Collapse Filters & Views with an active Sankey flow and a partially typed Saved Filter Views name. Reopen. | Filters Active count/details remain accessible while collapsed; no filter or typed name lost. |
| B15 | Save, load, rename, then delete a **saved filter view**; switch between custom dashboards. | Preset is reusable and independent from named dashboard layout storage; 12-preset limit and exact selections are respected. |
| B16 | Change an interactive chart preference, hide its panel, save, switch and return, then unhide. | Saved metric/mode restored; unmounting never silently resets its saved preference. |
| B17 | Use Order Explorer search, sort, 25-row paging and detail; apply focused flows and date range; CSV export. | Filtered cohort matches exported records; zero-item and null amounts represented accurately; no unrelated orders leak. |
| B18 | Export a custom dashboard JSON and import it under another name. Try malformed JSON and an unsupported schema version. | Valid import works; unsafe imports fail without overwriting existing dashboards or executing content. |
| B19 | Open two tabs on the **same origin**. Save dashboard changes in tab B while tab A remains stale; attempt write from A. | A warns about cross-tab change and blocks stale overwrite; explicit reload available; unsaved draft not silently lost. |
| B20 | Temporarily deny storage in a controlled browser test environment (e.g. a throwaway profile), attempt create/save. | Honest failure; no false “Saved” success; existing settings are not overwritten. Do **not** delete production localStorage as a test. |
| B21 | At narrow width, use all controls with keyboard: Tab/Shift+Tab, Enter/Space, Escape for menus; inspect visible focus. | Controls are reachable and labeled; layout has no overlap or horizontal cutoff; reorder buttons work without dragging. |
| B22 | Repeatedly filter/clear, switch between A/B, toggle themes and chart measures, and watch browser console/diagnostics. | No unexpected errors, focus loss, stale filters, degraded performance, or runaway rerenders; preserve WU-10 behavior. |

For B22, measure the actual full-data desktop interaction response with Developer Tools or WU-10 diagnostics. **≤500 ms** for visible filter response is the project target, **not** an assumed result. If the result exceeds the target, record observed timings and investigate before approval.

## Gate C — Security, privacy and Git review

- Confirm no Olist raw source files, **row-level** public/data exports, `.env`, credentials, locally downloaded artifacts, `node_modules`, `dist`, caches, or test log/evidence files are staged.
- Inspect `git status --short`, `git diff --stat`, and `git diff --check`. Preserve unrelated changes; do **not** reset them to make the release appear clean.
- Preserve existing developer diagnostics, WU-07 filters, export formula escaping, WU-09 input sanitation and WU-10 responsiveness. A test failure in these areas is a WU-11 blocker even if WU-11-specific tests pass.
- Only stage reviewed WU-11 code, tests, docs and configuration. Avoid an indiscriminate `git add -A`.

**After every gate passes**, check the staged diff:

```powershell
git status --short
git diff --stat
git diff --check
# Stage ONLY reviewed WU-11 paths, using explicit paths and/or git add -p.
git diff --cached --name-only
git diff --cached --check
git diff --cached --stat
```

Check that the staged list includes no private data or unrelated work. The planned commit (performed by the owner, not the release-check script) is:

```powershell
git commit -m "feat(dashboard): complete WU-11 customizable workspaces"
git push origin feature/dashboard-poc
```

Verify the actual current branch/upstream with `git status -sb` first; change the `git push` target if the owner's repository is on a different branch. Do not commit/push until all A/B/C cases are signed off.

## Gate D — Signoff record

Fill out in the browser-test report or equivalent:

| Evidence | Result |
|---|---|
| Local timestamp / Git branch and HEAD | PENDING |
| Typecheck + 106 expected React tests | PENDING |
| 111 expected Node tests + Python suite | PENDING |
| Static security + production build | PENDING |
| Full Olist reconciliation | PENDING |
| Browser B01–B22 (desktop/mobile, dark/light) | PENDING |
| WU-10 performance observation and remaining issues | PENDING |
| Staged-files security review | PENDING |
| Commit hash / push confirmation | PENDING |

If any item is FAIL or NOT RUN, WU-11 is **not yet released**. Fix only the failing contract, rerun the relevant suites, and repeat the local gate before committing.
