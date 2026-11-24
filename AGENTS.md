# AGENTS.md — Commerce Delivery Intelligence

Read `docs/WORK_UNITS.md`, `docs/WU05_SPEC.md`, `docs/WU06_SPEC.md`, `docs/WU07_SPEC.md`, `docs/DATA_SPECIFICATION.md`, and **all** other `docs/*.md` before any authorized implementation.

**Do not edit, install, execute project code, create branches, commit or push based on a planning/inspection request.** Implement only explicitly authorized WU-00…WU-07, check prerequisites, stop at its acceptance gate, report actual tests, and protect unrelated changes. Never commit Olist source or derived row-level data to the public GitHub repo without specific distribution approval.

Canonical types/metrics/selectors live in `src/domain/`; loader/index in `src/data/`; app state in `src/app/`. Local-only runtime; dark/light themes, dark default; seller-origin map default; unbounded historical date default. No autonomous expansion to backend or hosting.

**WU-05 note:** The array-valued seller/customer/category groups and separate `focusedFlow` from `docs/WU05_SPEC.md` supersede original single-value P0 filter contracts. Sankey uses broad context, KPI/table use focused cohort when selected.

**WU-06 note:** Owner authorized expanded delivery analytics. Read `docs/WU06_SPEC.md`. Preserve WU-05 global filter and focused-flow contract; map/Sankey measure switches are local presentation state. No WU-07 implementation without authorization.

**WU-07 update (authorized 2026-11-23):** Read `docs/WU07_SPEC.md`. `focusedFlows: FlowPair[]` supersedes `focusedFlow: FlowPair | null` in earlier specs; multi-select exact directed pairs are OR-intersected with unchanged global filter groups. Owner-approved advanced analytics, CSV and saved views remain local only. Stop after WU-07 acceptance; no further units authorized.
