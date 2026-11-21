# AGENTS.md — Commerce Delivery Intelligence

Read `docs/WORK_UNITS.md`, `docs/DATA_SPECIFICATION.md`, and **all** other `docs/*.md` before any authorized implementation.

**Do not edit, install, execute project code, create branches, commit or push based on a planning/inspection request.** Implement only explicitly authorized WU-00…WU-04, check prerequisites, stop at its acceptance gate, report actual tests, and protect unrelated changes. Never commit Olist source or derived row-level data to the public GitHub repo without specific distribution approval.

Canonical types/metrics/selectors live in `src/domain/`; loader/index in `src/data/`; app state in `src/app/`. Local-only runtime; dark/light themes, dark default; seller-origin map default; unbounded historical date default. No autonomous expansion to backend or hosting.
