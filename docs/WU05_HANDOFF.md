# WU-05 implementation handoff — validation pending

**Branch:** `feature/dashboard-poc` (base GitHub commit observed: `a88a6ae2411d09152a920466c897df26c061ab16`, `feat: complete WU-04 order explorer and dashboard integration`).

## Scope implemented

- Array-valued global filter groups and explicit focus pair; reducer that keeps global selections intact on ribbon selection and clears incompatible focus after origin/destination edits.
- Selectors preserving distinct orders and same-item seller/category matches; focused cohort intersected with the global eligible items; category and freight values only for the focused matching items.
- Checkbox multi-select dropdowns with individually removable chips, per-group clear, category search, keyboard-capable details/summary controls.
- Map state multi-toggle and self-dimension-excluded counts to preserve addable states; focus highlighting.
- Sankey persistent click focus and temporary hover, dimmed but visible nonselected flows, accessible selection list and separate focus clearing.
- Monthly trend context plus focused-flow overlay without losing full-history months.
- Order detail matching-item marking honors both multi-select and flow focus.
- Updated domain/Node/React tests and canonical WU-05 documentation; no new runtime package dependencies or Olist exports.

## Actually executed here

- **PASS:** Global TypeScript 5.8.x `tsc -p tsconfig.node-tests.json` — domain, app reducer and data module compilation.
- **PASS:** `node --test tests/domain.node.cjs tests/orderExplorer.node.cjs tests/wu05.node.cjs` — **22/22 tests**.
- **PASS:** TypeScript syntax parser over 26 TS/TSX source/test files — **0 parse diagnostics**.
- **PASS:** Created patch ZIP; contents/integrity check is required before delivery.

## Not run / needs local verification

- React TypeScript typecheck, Vitest/RTL, production Vite build (npm dependencies unavailable in isolated execution environment).
- Browser screenshots, UI/keyboard, theme contrast, mobile width, performance measurement.
- Real Olist full-source `check_olist.cjs` and `check_explorer.cjs`, although the WU-04 baseline previously passed on user's machine. No new ETL inputs required.
- GitHub commit/push. The connection has previously returned `403 Resource not accessible by integration`; this implementation is delivered as a ZIP to merge into the local branch.

## Acceptance commands (PowerShell)

```powershell
cd C:\Users\ptanz\job_search\commerce_dashboard
git checkout feature/dashboard-poc
npm install
python -m unittest discover -s tests -p "test_*.py" -v
npm run typecheck
npm test
npm run test:node
npm run build
node tests/check_olist.cjs
node tests/check_explorer.cjs
npm run dev
```

Check all scenarios in `docs/WU05_SPEC.md`, particularly persistent Sankey overview under focus, saved group chips, state multi-toggle, empty results, and matched-vs-full order amounts. **Do not commit until actual local tests and browser review pass.**

The existing `package-lock.json` remains valid because this enhancement adds no package dependencies; `npm install` may reconcile npm-generated metadata locally.
