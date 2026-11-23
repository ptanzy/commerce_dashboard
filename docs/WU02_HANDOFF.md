# WU-02 Handoff — React shell, shared filters, KPIs, dark/light

**Status:** IMPLEMENTED / LOCAL ACCEPTANCE PENDING  
**Target branch:** `feature/dashboard-poc`. No files committed or pushed by the assistant.

## Scope and files

Changes are confined to WU-02; WU-01 selectors, ETL scripts, geometry, and
source-derived data were not modified. New or updated:

- `package.json` — adds React, React DOM, Lucide, Vite, Tailwind v3, RTL and jsdom; preserves Vitest and separate Node analytics suite.
- `tsconfig.json`, `tsconfig.node-tests.json` — React JSX and browser types while keeping Node unit compilation limited to the existing domain/data layer.
- `index.html`, `vite.config.mts`, `tailwind.config.cjs`, `postcss.config.cjs` — local Vite SPA with `base: '/'`, no hosting or runtime server.
- `src/main.tsx`, `src/styles/index.css` — responsive dashboard shell and semantic dark/light design tokens, reduced-motion rules.
- `src/app/App.tsx`, `filterReducer.ts`, `theme.ts`, `useDashboardData.ts` — app composition, canonical reducer, persisted theme, abortable fetch states and memoized selectors.
- `src/data/loader.ts` — concurrent static JSON fetch with clear missing/corrupt-file errors and single-pass WU-01 runtime schema/index validation.
- `src/components/FilterPanel.tsx`, `KpiCards.tsx`, `format.ts`, `stateNames.ts` — date/state/category filtering, independent chips and reset; 4 KPIs using the **WU-01 domain selectors only**.
- `tests/ui/{fixtures.ts,dashboard.test.tsx,loader.test.ts}` — RTL and loader integration tests covering default cohort, same-item seller/category semantics, matching freight, zero-item orders, empty cohorts, date chips, theme persistence, corrupted and missing assets.
- `README.md` — local install/run/acceptance commands and explicit WU-03/WU-04 exclusions.

**Important:** The 27-state TopoJSON produced in WU-01 is already in the
repository; WU-02 does not modify it. Map/trend/Sankey areas in the UI are
**labeled placeholders**, not chart implementations.

## Evidence executed in the assistant environment

- **PASS:** `tsc -p tsconfig.node-tests.json && node --test tests/domain.node.cjs`: 12/12 preexisting WU-01 Node analytics tests passed.
- **PASS:** TypeScript syntactic parsing of all 18 source/test TS, TSX and MTS files present at the time of the check: zero parser diagnostics. This is **not** equivalent to a full typecheck.
- **NOT RUN:** `npm install`, full `npm run typecheck`, `npm test` (Vitest + RTL), and `npm run build` because this isolated environment does not have React, Vite, Vitest, jsdom or Tailwind installed, and `registry.npmjs.org` is unreachable (DNS resolution failure). No local browser screenshot or runtime visual inspection performed.
- **NOT RUN:** The user's local browser manual acceptance, 1440px/390px responsive inspection, theme contrast and keyboard walkthrough.

## Commands for local validation (Windows PowerShell)

```powershell
cd C:\Users\ptanz\job_search\commerce_dashboard
git checkout feature/dashboard-poc
npm install
npm run typecheck
npm test
npm run test:node
npm run build
npm run dev
```

At `http://127.0.0.1:5173/`, verify a full-source default (99,441 distinct
orders and 93.2% on-time rate for the known Olist archive), seller SP + category
and customer state AND filters, individual chip clear and global reset, date
bounds, empty-cohort N/A display, theme persistence after reload, mobile
controls at 390px, visible focus/keyboard navigation, and explicit chart
placeholders. To test missing-data handling, temporarily rename a `public/data/`
file and verify the error screen; restore it afterwards.

### Production dataset prerequisites

The local ignored `public/data/` JSON files created by WU-01 must exist. If
missing, run:

```powershell
python scripts/prepare_data.py --input data/raw/olist.zip --output public/data
```

**No Olist records, source ZIP, or generated item/order facts should be staged
or published.** `public/geo/` is the distinct MIT-licensed boundary dataset,
which was committed in WU-01.

## Exit gate

WU-02 is **not yet accepted**. Confirm `npm run typecheck`, `npm test`,
`npm run test:node`, `npm run build`, and real-data browser smoke all pass.
Update lockfile with `npm install` and review `git status` before commit.
Stop before WU-03 until the owner accepts this gate.
