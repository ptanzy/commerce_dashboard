# WU-11 Phase 2B — Filter Visibility, Warnings, and Row Alignment

This follow-up corrects user-accepted requirements after Phase 2's section preview.

## Required distinctions

- **Filter selection, removal, reset and ordinary Sankey focus interactions do NOT trigger toast messages.** Existing immediate selection feedback still applies.
- **Hiding an interface that currently carries an applicable filter DOES trigger one short notice** informing the user that the filter remains active. Hiding an unrelated or unfiltered section does not.
- Global filter state and exact directed Sankey focus are independent of visualization visibility. The analytical cohort and CSV export must remain unchanged when sections disappear.
- A compact **Filters Active** disclosure is available above the dashboard whenever any filter is applied. Expanding it reveals the specific seller origins, destinations, categories, date range, and directed flow pairs. Filters can be removed there even when their original controls are hidden.
- The full filter-controls panel can be hidden separately from the eight analytical sections. Hiding it preserves filters and leaves a **Show filter controls** action. This preview-only preference is not persisted yet.
- A notice closes after ~4.5 seconds; users can dismiss it directly, and hovering/focusing it pauses dismissal. Announcements should not steal keyboard focus.
- Layout cards in the same row stretch to the same height. This will introduce unused space inside intrinsically shorter cards (especially Delivery trends alongside Geography); it is a conscious visual-alignment tradeoff, not a data or scaling change. Single-column breakpoints retain natural section heights.

## Detection rules

| Hidden UI | Only notify when |
|---|---|
| Full filter controls | Any filter, date or focused directed flow is active |
| Shipping Sankey | One or more directed-flow focuses are active |
| Geographic distribution | Seller origin or customer destination selection is active |
| Delivery trends | A purchase date bound is active |
| Category leaderboard | A category constraint is active |
| Other sections | No notice (they do not introduce the global selection constraints above) |

Notice wording is deliberately generic; filter values remain available in the secure local summary rather than being logged or transmitted.

## Scope and Phase 3 boundary

- Existing WU-11 section IDs, immutable Full Dashboard, and version-1 persistence contracts remain unchanged.
- Phase 2B only introduces preview-local `filterPanelVisible`; the Phase 3 named-dashboard design must explicitly version and validate it before persisting. Do **not** implicitly add unrecognized keys to schema v1.
- The current FilterPanel's own chips remain for backwards compatibility; the new persistent summary is intended to replace the long flow-focus explanatory banner. Consolidation of the remaining chip presentation is optional future UI refinement.

## Acceptance

1. Select an origin or flow: no toast, filter context disclosure available.
2. Hide a relevant chart while the filter is active: one dismissible toast, identical KPI result, filter still listed.
3. Hide an unrelated chart or hide Sankey with no focused flows: no toast.
4. Hide full filters while active: toast; compact list and Show filter controls remain available; CSV and saved views still work.
5. Expand/collapse Filters Active and remove a filter; underlying cohort updates, without a toast.
6. Observe paired Geography/Trends and Category/Delay panels at desktop widths: paired outer cards have equal row height. Verify narrow view stacks without overflow.
7. Check keyboard focus, Escape behavior for dropdowns, light/dark themes, and auto-dismiss timing.
