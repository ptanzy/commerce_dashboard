# WORK_UNITS.md — canonical AI agent instructions, version 2

**Project:** `ptanzy/commerce_dashboard` · local two-day React+D3 Olist POC · **WU-00 through WU-04**

## Required operating rules for ChatGPT, Copilot, Codex and other agents

**Before doing anything to code**, inspect repo tree, `git status`, current branch, `README.md`, `AGENTS.md` and **all** `docs/*.md`. Read `DATA_SPECIFICATION.md` and `ARCHITECTURE.md` especially carefully. Report which WU is eligible and the evidence for its prerequisites. **Inspection-only requests are not implementation authorization.**

Implement **only** the WU the owner explicitly authorizes; stop after its test and handoff gate. The owner can authorize multiple WUs but each gate still applies. Protect preexisting user changes; never reset, force push, delete untracked files or edit unrelated files. Work on a user-approved feature branch, never push to `master` without permission. Do not install dependencies, create/modify files, run commands or publish data in inspection-only mode. Report failures, incomplete work and checks not run accurately. Don't claim that tests or human visual acceptance passed unless actually executed and observed.

When specs conflict, follow this order: current explicit owner instructions → `DATA_SPECIFICATION.md` (metric/filter grain) → `TESTING_AND_ACCEPTANCE.md` (gates) → `PRODUCT_AND_FEATURES.md` (P0/P1) → `ARCHITECTURE.md` (folder/state ownership) → `VISUALIZATION_AND_UX.md` (appearance/interactions) → `IMPLEMENTATION_PLAN.md` (schedule) → this file (execution mechanics). **Do not independently rewrite foundational contracts**; escalate material conflicts.

## Approved scope and stack

**P0:** Olist local CSV ZIP → Python+DuckDB processing → validated compact order/item JSON + manifest; React/TS/Vite dark-and-light local app, four correct KPIs, shared date/destination/seller/category filters, seller-origin-first 27-state D3 map, month-click fixed-domain D3 trend, top-15 directed item-count Sankey, TanStack distinct-order explorer/drawer, testable cross-filtering, validation, local build and manual acceptance.

**P1 (after P0):** P95 chart, period comparisons, Sankey freight/value measure switch, map rate/duration toggle, chart brush, visual transitions, Playwright. **Excluded:** backends, SQL server, geo-prefix joins, GPS/routes/carriers, payments/reviews, public hosting, external live APIs, auth, Redux, heavy geo map frameworks.

**Never invent** source counts, license clearance, actual routes, performance timing, a passing test or Olist observations. The locally present Olist ZIP may be used for analysis but remains Git-ignored, along with row-level derived exports. Record source license (Kaggle currently lists CC BY-NC-SA 4.0) and geography attribution in `docs/DATA_PROVENANCE.md`.

**Canonical folders:** `src/app/` for reducer/theme/shell, `src/domain/` for types/metrics/selectors, `src/data/` for loader/index, `src/components/` for reusable UI, `src/charts/` for D3, `src/features/orders/` for table/drawer, `scripts/` for ETL, `tests/fixtures/` for tests. Do not create alternate `src/analytics/` or `src/types/` sources of truth.

## Always enforce data contracts

- One order per `orderId`, one item per (`orderId`, `orderItemId`); seller belongs to item. Category and seller filters must match **the same item**; order cohort is distinct IDs of matched items only when item filters active. Without item filters, eligible valid-purchase-date orders include zero-item orders.
- Order delivery KPIs count orders once; financial KPI and table financial columns use **matching items**, not whole order totals. Order drawer can show separate clearly labeled full-order sums. Zero-item order amount = `—`.
- `delivered` with incoherent negative duration: delivery class `unknown`, no on-time or duration eligibility; compare calendar **dates** for on-time. Fractional duration days, R-7 quantiles, one-decimal UI.
- No `geo-flows.json`, `locations.json`, or geolocation CSV in P0. Use actual seller/customer UF codes and validated 27-state TopoJSON.
- Sankey top **15 directed item-count links** including SP→SP; origin:SP and dest:SP are different nodes. P1 alternate weights only. Link selection sets seller+customer pair atomically, no `selectedSankeyLink` state.
- Trend retains full-history month axis under date filters; clicking month sets date range while chart remains navigable and shows outside-range months muted. The contextual chart scope is explained clearly.
- Dark/light token-driven presentation, dark first visit, theme choice persists locally and never resets filters. `base:'/'`, no GitHub Pages.

## Ordered work units and exit gates

### WU-00 — Source data and geographic verification

**Prerequisites:** Owner has provided local `data/raw/olist.zip` (or extracted originals). No app implementation yet.

1. Inspect file inventory/headers/row counts, primary/foreign key cardinality, status and date quality, missingness, multi-seller/category orders, missing category translations and financial irregularities. Verify **six required business CSVs**, not the optional geolocation table.
2. Confirm the existing source dataset license and attribution from its listing; document whether local derived assets are Git-ignored. **Don't block local-only work solely because public redistribution is not approved**; block public commit of data.
3. Select one Brazil 27-state topology candidate from `DECISIONS_AND_RISKS.md`, inspect mapping to UF strings and confirm source usage rights. Record chosen immutable version/source, checksum and state mapping. If no reusable topology is available, report blocker rather than inventing shapes.
4. Reconcile assumptions in `DATA_SPECIFICATION.md` with actual observed anomalies; propose minimal contract changes only where evidence warrants.

**Deliverables:** `docs/DATA_PROFILE.md` (observed counts and reproducible queries), `docs/DATA_PROVENANCE.md` (source and license, topology mapping), validated source asset decision.

**Tests/gate:** CSV keys and states accounted for; 27 topology features verified; provenance documented. No WU-01 until WU-00 accepted.

### WU-01 — Compact ETL, data contracts and metrics/selectors

**Prerequisite:** WU-00 accepted.

1. Create `scripts/prepare_data.py` using **DuckDB and Python**, not dual Pandas path. Read local ZIP/CSVs; create `orders.json`, `items.json`, `metadata.json` according to `DATA_SPECIFICATION.md`.
2. Build deterministic unit fixtures and a minimal TypeScript domain package under `src/domain/` (types, cohort filter selector, metric definitions); loaders/index helpers under `src/data/` where necessary. Add minimal npm project tooling for Vitest/TS tests if not already available, but **do not implement dashboard UI**.
3. Generate data locally under gitignored `public/data/`, account for nulls/unmatched joins, export file sizes and actual source counts; use only necessary fields and stable sort.
4. Test distinct order grain, category+seller intersection, zero-item orders, same-day delivery, negative duration, zero denominator, R-7 percentiles, matched freight and seller-state membership.

**Tests/gate:** Document executed ETL/test commands; actual outputs validate and reconcile; metric/selectors pass; no unreviewed publication of rows. WU-02 only when accepted.

### WU-02 — React shell, themes, filter controls and KPIs

**Prerequisite:** WU-01 accepted.

1. Scaffold/configure Vite React TypeScript app and Tailwind with local `base:'/'`. Load/validate JSON with explicit loading/empty/error states; create item index once.
2. Implement `useReducer` using the canonical `Filters`/`FilterAction`, filter chips/reset and clearly labeled seller/destination/category/date controls. Set initial date unbounded (all valid history).
3. Add dark/light semantic tokens, dark first-visit default and `localStorage` persistence; no theme-induced cohort changes. Four KPI cards use tested domain selectors.
4. Test default counts/denominators, multi-item seller/category filters, missing values, empty state, theme persistence, 1440px + 390px baseline shell usability.

**Tests/gate:** Local app loads and four KPIs are correct; typecheck, relevant tests and build pass; no chart implementation required. WU-03 next.

### WU-03 — D3 map, trend and Sankey with linked interactions

**Prerequisite:** WU-02 accepted.

1. Add `d3-geo` 27-state map using approved TopoJSON; default seller-origin, destination toggle; click state produces correct field filter.
2. Build D3 monthly trend with fixed full-history X-domain and click-month date selection; show selected range without hiding remaining historical months; no P0 drag brushing.
3. Build d3-sankey with **top 15 directed item-count links**, same-state flows preserved, mappable-coverage label and accessible link/node selection using `set_flow_pair`.
4. Ensure all charts derive from canonical selectors; use D3 for layouts, React for SVG. Test every chart in both themes and at desktop/mobile widths as it is built, and add accessible control equivalents.

**Tests/gate:** Correct global cross-filter behavior, no stale selections, valid map IDs, top-N reconciliation, chart empty/low-N states, readable dual theme. WU-04 next.

### WU-04 — Order explorer, full integration and local acceptance

**Prerequisite:** WU-03 accepted.

1. Implement TanStack Table one row per eligible order with search/sort/25-per-page pagination; detail panel shows complete items and separately labeled full-order amounts. Financial columns in table are **matching-item** totals.
2. Ensure charts can drill through to matching order cohort; keyboard/focus, missing fields and zero-item display checked.
3. Complete the manual P0 walkthrough in `TESTING_AND_ACCEPTANCE.md` using actual source data; validate responsive design/theme contrast and latency, record actual file sizes/timings.
4. Run all available TS typecheck, Vitest, Python checks, production build and Vite preview; README includes accurate local commands and license disclaimer. No public deploy.

**Tests/gate:** All P0 checks passed or remaining defects explicitly listed, documented and not claimed complete. Report genuine browser inspection results, not only theoretical correctness.

## Final report format (mandatory for every WU)

```md
## Work Unit
WU-XX — Title

## Status
PASS | PARTIAL | BLOCKED

## Changes
- Files/branch/commits and outcome

## Validation
- PASS: command + observed result
- FAIL: command + observed error
- NOT RUN: check + reason

## Data and Provenance
- Source files, actual counts/output bytes if applicable; license status

## Known Issues
- Severity, symptom and action needed

## Next Allowed Work
- Next WU, unmet prerequisites, and explicit stop
```

## Reusable prompts

**Inspection-only:**
> Read `AGENTS.md`, `README.md`, and all `docs/*.md`. Do not create/edit files, install packages or execute project commands. Report branch/working tree, source availability, scope, architecture, canonical data semantics, WUs, blockers and next eligible WU. Await authorization.

**Implement single WU:**
> Read and obey `docs/WORK_UNITS.md` and all referenced specs. Implement **WU-XX only** after verifying prerequisites. Keep changes within WU scope; run relevant tests; report actual outcomes in the mandatory handoff format. Stop after the WU gate; do not start the next WU.

**Review-only:**
> Inspect latest WU changes versus `docs/WORK_UNITS.md`, `docs/DATA_SPECIFICATION.md`, and `docs/TESTING_AND_ACCEPTANCE.md`. Do not modify anything. Report concrete bugs, grain/filter inconsistencies, missing checks, license risks and discrepancies in severity order.
