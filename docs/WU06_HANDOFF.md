# WU-06 implementation handoff — awaiting local UI acceptance

## Status

Work unit implemented against `feature/dashboard-poc` WU-05 baseline (`f36f13843d2b2e8caa7b5c7d8be920e614f804d0`). No remote write/commit attempted.

## Main changes

- `src/domain/selectors.ts`: distinct-order state performance, delivery outcome segments, and mode-weighted Sankey summaries (unchanged default item count contract).
- `src/components/KpiCards.tsx` and `src/components/DeliveryBreakdown.tsx`: fifth P95 KPI and segmented punctuality distribution with unknown disclosure.
- `src/charts/BrazilMap.tsx`: local performance measurement toggle, neutral low-N states, denominator disclosure, contextual top/bottom state rankings.
- `src/charts/ShippingSankey.tsx`: item / freight charge / item value switch with weighted top-15 ranking and weighted coverage. Preserves broad context and focused-flow emphasis.
- `src/styles/index.css`: responsive dashboard layout for additional KPI and analytics controls.
- `tests/wu06.node.cjs`, `tests/ui/wu06.test.tsx`: new regression cases.
- `package.json`: include new Node regression suite. No new runtime dependency.

## Validation

Executed in assistant container: TypeScript domain compilation, Node regression suite, TSX syntax transpilation. Node packages were not locally available and dependency installation was unsuccessful (registry inaccessible), so `npm run typecheck`, `npm test`, full `npm run build`, browser acceptance, and real Olist dataset check must run on developer's Windows machine. Do not infer pass from syntax checks alone.

## User steps

Extract WU-06 ZIP as an overlay into the existing repository. Preserve `data/raw/`, `public/data/`, and `public/geo/`; they are not part of the overlay. Run:

```powershell
cd C:\Users\ptanz\job_search\commerce_dashboard
npm install
python -m unittest discover -s tests -p 'test_*.py' -v
npm run typecheck
npm test
npm run test:node
npm run build
node tests/check_olist.cjs
node tests/check_explorer.cjs
npm run dev
```

Review all toggles, use flow focus before/after switching Sankey measures, compare KPI/table records, check both themes and narrow viewport. Commit WU-06 only after all gates pass; stage only intended changes, never raw/derived data.
