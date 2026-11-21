# WORK_UNITS.md — AI implementation instructions

**Repository:** `ptanzy/commerce_dashboard`
**Product:** Commerce Delivery Intelligence — two-day proof of concept
**Audience:** ChatGPT, GitHub Copilot, Codex, or any coding assistant
**Status:** Planning specification, not an instruction to begin all work automatically
**Scope authority:** This file coordinates implementation; the source of truth for domain behavior remains the linked specification documents.

## 0. Read this first — mandatory operating contract

Before creating, editing, installing, or executing anything:

1. Inspect the repository tree and current branch/status. Do not assume it is empty.
2. Read `README.md` and **all** documents under `docs/`, especially:
   - `ARCHITECTURE.md`
   - `PRODUCT_AND_FEATURES.md`
   - `DATA_SPECIFICATION.md`
   - `VISUALIZATION_AND_UX.md`
   - `IMPLEMENTATION_PLAN.md`
   - `TESTING_AND_ACCEPTANCE.md`
   - `DECISIONS_AND_RISKS.md`
3. Report a concise inventory, the current implementation stage, source-data availability, significant discrepancies, and the next eligible work unit.
4. **Implement only the specifically authorized WU.** A request to inspect, plan, or estimate is **not** approval to change files.
5. If prerequisites for the authorized WU are missing, perform only safe, useful substeps and report the blocker. Never fabricate source data, passing tests, screenshots, or user approvals.
6. Before edits, check the working tree and respect preexisting user modifications. Do not reset, overwrite, delete, merge, force-push, or edit unrelated files.
7. Prefer one branch for the POC, with small, reviewable commits/PRs. Do not commit or push to `main` without explicit approval.
8. Do not introduce a new platform, backend, ORM, database server, authentication, streaming pipeline, maps SDK, or chart framework without explaining the deviation and getting approval.

**Task boundary:** The agent may make the changes needed to complete an authorized WU, run locally supported checks, and report the result. It must stop at the WU exit gate; never start the following WU automatically. The owner may explicitly authorize a batch of WUs.

## 1. Product in one paragraph

Build a polished, **single-page, static React + TypeScript + D3** dashboard over the historical Olist Brazilian E-Commerce dataset, focused on order-to-delivery reliability and item-level freight charges. The page has KPI cards, geographic state map, seller-state → destination-state Sankey diagram, time-series trends, order explorer, and coordinated filtering. Use reproducible Python preprocessing, prebuilt static assets, no backend, and **local-only execution**. Keep the POC achievable in approximately two focused development days by prioritizing correct, demonstrable interactions over animation or enterprise infrastructure.

## 2. Scope and dependency rules

### Required P0 behaviors
- Data sourced from actual verified Olist CSV inputs, or from an **explicitly labeled fixture** when full data cannot be used or published.
- Four KPI cards: distinct orders, on-time rate, median order-to-delivery duration, and freight-charge/item-price ratio.
- **Both dark and light modes** with a visible accessible toggle, dark initial default and persisted preference.
- **Seller-origin map default**, with customer-destination toggle; map clicks filter the displayed state dimension.
- **All valid historical purchase dates** selected by default.
- Shared date, destination state, product category filters and clearable selections.
- D3 Brazil state choropleth, monthly trend chart, and bounded top-N `d3-sankey`.
- TanStack Table-based searchable/sortable/paginated distinct-order explorer and record detail.
- Tooltips, units, loading/empty/error states, accessibility basics, responsive layout.
- Data reconciliation, metric and selector tests, production build, static base-path verification.

### P1 if time permits
- Prior-equivalent-period KPI comparison, P95 duration toggle or chart, advanced date brushing, Sankey measure toggle, subtle transitions.
- Never delay or compromise P0 correctness to add P1.

### Explicit exclusions
No carrier/GPS route tracking, delivery vehicle simulation, actual shipping-cost claims, live APIs, authentication, payment/review analytics, forecast models, backend services, PostgreSQL, Redis, Kafka, Kubernetes, MapLibre, deck.gl, or Redux.

## 3. Approved implementation stack

- React + TypeScript + Vite
- D3 modules (`d3-geo`, scales, shape etc.) and `d3-sankey`; `topojson-client`
- Tailwind CSS for styling
- TanStack Table for the order explorer
- Python + DuckDB for offline transforms; Pandas only if materially easier
- Browser-readable preprocessed JSON / TopoJSON
- Vitest + React Testing Library; Python tests/assertions; Playwright smoke test if feasible
- Local Vite dev/build/preview; Vite `base` remains `/` for local paths; no GitHub Pages workflow

Prefer D3 for geometry/layout and React for the SVG DOM; imperative D3 DOM mutations only when justified. Charts receive typed data/selection callbacks and **do not** independently define business metrics.

Use compatible stable dependency versions confirmed at implementation time and commit a lockfile. Do not guess installed versions or claim checks ran if they did not.

## 4. Data semantics — nonnegotiable

Read `DATA_SPECIFICATION.md` for precise schemas and meanings.

- Order-level facts: **one row per `order_id`**, and total orders = distinct order IDs.
- Item-level facts: **one row per (`order_id`, `order_item_id`)**, with item `price` and `freight_value`.
- Orders can include several sellers/categories; do not duplicate order-level KPIs by joining item rows.
- Category filter matches an order if **at least one** of its items matches; conditional item-based freight ratios use the **matching items** only. The frontend must clearly label the active cohort.
- Delivery rate denominator: delivered orders with valid actual and estimated delivery dates. Compare **calendar dates** for early/on-time/late, not estimated midnight vs actual time of day.
- Delivery duration: purchase timestamp to customer delivery timestamp; not carrier transit time.
- Percentiles exclude unknown or invalid durations; zero denominator => `N/A`, never `NaN`.
- Freight is a **customer freight charge**, not a verified operating cost.
- Seller → customer state lines are **observed order relationships**, not real transportation paths.
- Geolocation prefix data has duplicates; deduplicate/aggregate prior to joins.
- Use English translations; retain explicit fallbacks where translation missing.
- Date filters use purchase date and inclusive local calendar dates; no invented UTC interpretation.
- For Sankey, flow weights may be item counts or freight amounts; distinct order totals must **not** sum distinct counts from overlapping buckets.
- Every exported number needs an identifiable source and reproducible transformation. Report exclusions and unmatched joins.

## 5. Execution sequence — 4 bounded work units

Every WU below has prerequisites, files/tasks, tests, and an **exit gate**. The WUs are ordered and can be assigned individually or in an explicitly authorized batch.

### WU-00 — Dataset reconnaissance and data-rights gate

**Prerequisites:** The owner has supplied the original Olist CSVs locally or made them otherwise available to the agent. For source file list, see `DATA_SPECIFICATION.md`.

**Actions**
1. Inspect all seven source CSVs (schema, count, nulls, uniqueness, referential relationships).
2. Check status/date distributions, multi-seller/multi-category orders, duplicate geolocation prefixes, missing categories, invalid numeric values, and translation coverage.
3. Locate a usable Brazil states TopoJSON source and record provenance/license. Confirm state-code mapping.
4. Review the Olist redistribution terms before committing **any** derived public data.
5. Draft a compact profiling report with actual counts and decisions on missing/invalid records.
6. Determine whether production assets can include real processed data, or whether public demo fixtures are required.

**Deliverables:** `docs/DATA_PROFILE.md` (actual observations, queries, exclusions, source links), `docs/DATA_PROVENANCE.md` (license/distribution decision), updated contracts only if actual data forces changes.

**Exit gate:** Inputs verified, join semantics confirmed, geography source and publishing policy settled. **Do not proceed if files or licensing disposition are missing.** The agent may write a *provisional* report, but must label it as unverified and not claim WU-00 passed.

### WU-01 — Data pipeline, project foundation, verified metrics

**Prerequisites:** WU-00 exit gate passed, or owner explicitly authorizes **fixture-only foundation** (must remain labeled fixture, not Olist analysis).

**Actions**
1. Scaffold Vite React/TS app with Tailwind, Vitest, D3 and TanStack Table, configured for local Vite dev and preview (`base: '/'`).
2. Create reproducible Python preprocessing under `scripts/` using DuckDB where useful.
3. Produce typed `orders`, `items`, optional `geo-flows`, `locations`, `metadata`, and states topology according to `DATA_SPECIFICATION.md`. Preserve order/item grain.
4. Commit **no raw Olist data by default**. Generated public assets only if data rights review allows; otherwise small clearly labeled synthetic fixtures plus instructions for private local generation.
5. Implement typed browser loader, deterministic metric functions and selectors; create four KPIs, date/state/category filters, basic shell and **dark-default light/dark theme switch** using semantic tokens and safe persistence.
6. Add schema/reconciliation checks and deterministic multi-item/date-boundary fixtures.

**Suggested files:** `package.json`, lockfile, `vite.config.ts`, `src/types/*`, `src/data/*`, `src/analytics/*`, `src/components/*`, `scripts/prepare_data.py`, `tests/*`, docs as needed.

**Tests:** Python input/output assertions; Vitest metrics/selectors; TS typecheck and production build. Verify zero-denominator, multi-seller, inclusive date, delivery-date semantics.

**Exit gate:** Local app starts; data loads without silent fallback; accurate four KPI values; all applicable tests pass; provenance is disclosed in UI.

### WU-02 — D3 geographic and delivery analytics

**Prerequisites:** WU-01 accepted.

**Actions**
1. Render Brazil choropleth with real state codes, selectable metric, legend, keyboard-accessible state selection and tooltips. **Default to seller origins**, provide a destination toggle and bind map selection to the correct filter dimension.
2. Build monthly order/delivery trend using D3 scales; ensure date filtering and percentage denominators match KPIs.
3. Add `d3-sankey` for seller state → destination state item contributions, with bounded top-N and a displayed-share indicator.
4. Route all chart interactions into a **single** shared filter model. Display removable filter chips and clear/reset.
5. Provide meaningful no-data states, responsive chart bounds, and readable legends.

**Tests:** Chart aggregation/selectors, click→filter→other charts updates, top-N sum reconciliation, keyboard affordances, no-data rendering.

**Exit gate:** State or category selection changes KPIs, map, trend, Sankey, and filters coherently. All map and Sankey claims are accurately labeled.

### WU-03 — Order explorer, integration, QA and local acceptance

**Prerequisites:** WU-02 accepted.

**Actions**
1. Add TanStack Table: search, sort, paginate; one row per matching order; detail drawer/panel with dates, status, item/category/seller and freight data.
2. Add drill-through from aggregate visualizations to underlying **matching** order records.
3. Check filters composition, cancellation/undelivered handling, missing translation, no matching orders, and repeated clear/select cycles.
4. Run typecheck, lint if configured, unit/component tests, Python validation, and production build; add a reproducible E2E smoke checklist (Playwright if available).
5. Check desktop/mobile layouts, keyboard navigation and **both themes** (including D3 SVG axes, legends, tooltips), static asset URLs in local dev and production preview.
6. Update README with installation, raw data acquisition, transform commands, local run/preview commands, and public-repository data caveats.
7. Do not add hosted deployment workflows or modify GitHub repository settings; deployment is not part of the POC.

**Exit gate:** All required P0 walkthroughs in `TESTING_AND_ACCEPTANCE.md` pass, outstanding issues documented, and local Vite dev/build/preview are verified. No public deployment is required or claimed.

## 6. Cross-WU test and quality gate

At each WU finish, report:
- Exactly what changed (files/commits/branch).
- Commands executed and outcomes (include errors and unresolved failures).
- Data provenance and dataset size actually used, if applicable.
- Tests executed vs. tests **not** executed.
- Remaining issues and severity.
- Whether exit criteria passed.
- What the next WU needs.

Do not treat a generated source file as proof of an executed app. Do not say visuals passed human review based solely on code. Never silently skip failed tests. Avoid large snapshots, snapshots of transient charts, and overly broad refactors.

## 7. Agent handoff template

At completion of each authorized WU, respond using exactly these headings:

```md
## Work Unit
WU-XX — <name>

## Status
PASS | PARTIAL | BLOCKED

## Changes
- <paths and concise explanations>

## Validation
- PASS: `<command>` — <result>
- FAIL: `<command>` — <error>
- NOT RUN: <check> — <reason>

## Data / Provenance
- <real dataset or labeled fixture, rows, source/license status>

## Known Issues
- <severity, symptom, mitigation>

## Next Allowed Work
- <next WU and prerequisites; do not start without authorization>
```

## 8. Start prompts for Copilot, Codex or ChatGPT

**Inspection-only prompt (no changes):**

> Inspect this repository, read `README.md`, `docs/WORK_UNITS.md`, and all other `docs/*.md`. Do not create, edit, install, or execute anything yet. Report the repository status, available datasets, architecture understanding, WU dependencies, and blockers. Identify the next eligible WU but do not implement it.

**Implementation prompt (one WU only):**

> Read `docs/WORK_UNITS.md` and every referenced specification first. Implement **WU-XX only** (replace XX with the authorized number). Respect all prerequisites, data provenance rules, scope limits and stop gates. Execute relevant tests, report actual results using the handoff template, and stop; do not start the next WU.

**Review-only prompt:**

> Review the latest WU changes against `docs/WORK_UNITS.md` and `docs/TESTING_AND_ACCEPTANCE.md`. Do not edit anything. Identify correctness bugs, schema mismatches, test gaps, scope drift, and security/licensing risks, ordered by severity. Verify claims only with available evidence.

## 9. Decision precedence and escalation

When documents conflict:
1. Explicit current user instructions
2. `docs/DATA_SPECIFICATION.md` for source grain, metric and filter semantics
3. `docs/TESTING_AND_ACCEPTANCE.md` for acceptance thresholds
4. `docs/PRODUCT_AND_FEATURES.md` for feature priorities
5. `docs/ARCHITECTURE.md` for technology boundaries
6. `docs/VISUALIZATION_AND_UX.md` for presentation
7. `docs/IMPLEMENTATION_PLAN.md` for sequencing
8. This WU document for execution and handoff mechanics

If any conflict changes a P0 metric or published data rights, **stop and ask** rather than invent a rule. For noncritical ambiguity, implement the simplest compliant choice, document it, and continue.

## 10. Non-goals for AI agents

This is not a request to:
- Rewrite the specs or restructure the repo without cause.
- Automatically implement every WU.
- Import unrelated packages or build general-purpose libraries.
- Claim proprietary shipping tracking data exists.
- Treat sample records as genuine Olist outcomes.
- Commit or publish source/raw data without review.
- Require Codex or ChatGPT Work; a normal coding session with GitHub tools is acceptable when authorized.
