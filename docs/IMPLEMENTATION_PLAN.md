# Implementation Plan — two-day target, five bounded work units

## Schedule philosophy

The user prioritizes completing a convincing local POC within roughly **two focused development days**, not building enterprise infrastructure. Time estimates are planning aspirations, not promises. Aim for one correct connected vertical slice early. No autonomous work beyond the explicitly authorized WU; all current changes are documentation-only until the user approves implementation.

## WU sequence and gates

| WU | Task | Completion evidence |
|---|---|---|
| **WU-00** | Verify actual ZIP, source joins, key data anomalies, TopoJSON identifiers/license and data rights | `docs/DATA_PROFILE.md`, `docs/DATA_PROVENANCE.md`, resolved data source assumptions |
| **WU-01** | DuckDB preprocessing, compact contracts, metric/selector engine and fixtures | Generated local order/item/manifest outputs, reconciled tests and data size report |
| **WU-02** | React app, theme system, shared filters, KPI cards and loading/error states | Local app runs, dark/light, cross-filtered KPIs, Vitest/RTL |
| **WU-03** | D3 choropleth, fixed-domain monthly trend, top-15 Sankey, accessibility and responsive checks | D3 charts react to shared filters with tested semantics |
| **WU-04** | TanStack order explorer, drawer, drill-through, integration and manual QA | Full P0 acceptance walkthrough, production build, README commands |

Dependencies are strictly `WU-00 → WU-01 → WU-02 → WU-03 → WU-04`. The user may authorize a batch, but every internal stop gate still applies. Keep WU count as **5** without inflating product scope. Feature additions are not a result of splitting WU-01.

## Stage-to-WU mapping

- **Stage 0:** WU-00 — data and provenance verification.
- **Stage 1:** WU-01 — data engine, contracts and deterministic metrics.
- **Stage 2:** WU-02 and WU-03 — React foundation and linked D3 visuals.
- **Stage 3:** WU-04 — order explorer, acceptance, README and local build.

This is **four stages including Stage 0**, not three. `WORK_UNITS.md` provides authoritative AI execution instructions and per-WU stop gates.

## Risk and guardrails

- **Never** spend WU-01 on the million-row geolocation CSV; we use seller/customer two-letter state codes and a separate state topology.
- Store source/derived row-level files untracked. Do not block local analysis on permission to publish; distribution to a public repository requires separate license review.
- **Only six** business-data CSVs needed for P0; optional reviews/payments/geolocation deferred.
- No `geo-flows.json` or `locations.json` for P0; no multi-stack ETL; no MapLibre, SQL service or React state framework.
- Browser JSON payload is an **unknown to measure**, not a presumed 75 MB problem; optimize only on evidence.
- P0 charts: fixed-domain month-click (no drag), top-15 Sankey item links (no metric toggle), state count map (no hatching), both themes.
- Manual mobile/keyboard checks occur **during component WUs**, not left exclusively to WU-04.

## Handoff protocol

For each authorized WU, report branch, changed files, exact commands/results, actual dataset provenance and counts, passed/failed/not-run tests, blockers, evidence for its exit gate, and the next permitted WU. Do not claim successful production screenshots without actual inspection. Preserve unrelated user modifications. Commit/PR only when authorized; do not push to `master` without permission.

## Definition of done

All P0 stories in `PRODUCT_AND_FEATURES.md`, invariants in `DATA_SPECIFICATION.md`, and gates in `TESTING_AND_ACCEPTANCE.md` are actually verified using real Olist data (or explicitly approved labeled fixtures). `npm run build` works; app runs locally; no provenance/route misrepresentations; unresolved P1 is openly deferred.
