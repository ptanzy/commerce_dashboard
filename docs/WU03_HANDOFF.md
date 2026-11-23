# WU-03 Handoff — D3 map, monthly trend and shipping flows

**Branch target:** `feature/dashboard-poc` (do not push to `master`).  
**Implementation status:** CODE PREPARED — **LOCAL ACCEPTANCE PENDING**.

## Scope and changes

- `src/charts/BrazilMap.tsx`: asynchronous 27-UF MIT-licensed TopoJSON loader/validator; D3 Mercator path fitting; seller-origin-first choropleth; customer destination view toggle; distinct order counts (origin counts overlap for multi-seller orders); accessible state selection list; selected-state chips through the shared WU-02 reducer; loading/error/empty display.
- `src/charts/DeliveryTrends.tsx`: D3 band/linear scales and monthly volume/on-time rate toggles; full-history X-domain based on existing `monthlyTrendContext`; date selection through the shared reducer while retaining all historical months; low-N and edge-month indicator; accessible month select/clear.
- `src/charts/ShippingSankey.tsx`: `d3-sankey` geometry for top 15 **directed item-count** flows computed by `topDirectedFlows`; separate origin/destination nodes even when UF matches; mappable coverage and unmappable count; link-click and accessible flow buttons apply atomic `set_flow_pair`; mobile horizontal scrolling.
- `src/app/App.tsx`: replaces WU-02 placeholders with three connected visualization sections; passes the existing immutable selected cohort and shared dispatch, no duplicate analytical formulas.
- `src/styles/index.css`: dual-theme chart variables, responsive visualization panels, hover/focus states, and readable mobile alternatives.
- `scripts/prepare_geo.py` and `tests/test_etl.py`: correct and regression-test TopoJSON-standard Polygon/MultiPolygon arc **ring nesting** (the earlier WU-01 converter emitted flat arc IDs that its own validator accepted; `topojson-client` cannot reliably read them). Regenerate the committed `public/geo/brazil-states.topojson` locally; its new checksum will differ.
- `package.json`: adds `d3-geo`, `d3-scale`, `d3-sankey`, `topojson-client` and appropriate TypeScript declarations. **Run `npm install` locally; commit its updated `package-lock.json`.** The ZIP intentionally does not include a fabricated lockfile.
- `tests/ui/charts.test.tsx`: synthetic 27-UF topology validation, origin/destination filtering, month-switch context, Sankey namespace/atomic pair selection, empty-flow handling.
- `tests/ui/dashboard.test.tsx`: adjusts existing WU-02 fetch-count assertion so the new independent geography request does not incorrectly count as an Olist data export request.
- `README.md`: local install/run, chart semantics and scope disclosures.

## Verification actually completed in assistant environment

- **PASS:** `npm run test:node` using globally installed TypeScript/Node: all **12/12 WU-01 analytics regression tests passed**.
- **PASS:** Updated Python unit tests: **9 passed, 1 skipped** (DuckDB integration package unavailable), including a new regression for spec-compliant TopoJSON ring nesting.
- **PASS:** TypeScript `transpileModule` successfully parsed all local `.ts` and `.tsx` source/test files: no syntax diagnostics. This **does not** constitute a semantic `tsc --noEmit` pass.
- **PASS:** Compared D3 Sankey and TopoJSON TypeScript signatures against DefinitelyTyped definitions to confirm supported generic types, geometry collection overloads and component imports.
- **NOT RUN:** `npm install`, `npm run typecheck`, `npm test` (Vitest+RTL), `npm run build`, `npm run dev` and browser visual acceptance. This execution environment cannot retrieve required npm packages (offline cache incomplete).
- **NOT RUN:** Real browser rendering of the 27-state production topology or actual Olist dataset. The existing WU-01 geography file is committed on the feature branch but wasn't downloaded into the isolated assistant build. WU-03 integration tests include synthetic geometry.
- **NOT COMMITTED:** GitHub previously rejected direct writes with 403; distribute via ZIP for local merge, test and owner commit.

## Local acceptance (owner)

Run from `commerce_dashboard` with Node/npm and the local ignored dataset already prepared:

```powershell
npm install
python -m unittest discover -s tests -p "test_*.py" -v
python scripts/prepare_geo.py
npm run typecheck
npm test
npm run test:node
npm run build
npm run dev
```

Inspect the browser in both light/dark themes at desktop (around 1440 px) and mobile (around 390 px):

1. **Regenerate TopoJSON before running the dashboard** with the corrected script, confirm 27 states and commit the newly generated `public/geo/brazil-states.topojson`. The original WU-01 TopoJSON had invalid nesting despite passing its old Python validator. Then confirm 27 clickable/keyboard-selectable UF regions without map error; initial mode is **Seller origins**. Clicking seller SP affects KPI totals, trend and Sankey while customer destination remains unset. Switch to destinations and click RJ; both chips remain; clear independently.
2. Map origin state counts may overlap across states without inflating national order KPI; tooltip explains this. Missing/zero data states retain neutral coloring.
3. Monthly chart initially shows the full historical range. Toggle between purchases and on-time rate; undefined rates are gaps, not false zero. Select March 2018 then another month directly; all history remains visible while KPI cohort changes. Clear date selection.
4. Sankey has ≤15 directed item-count links, includes same-state SP→SP where present, shows coverage relative to **mappable** records and any unmappable count. Click a visible link or keyboard-action button; the seller and customer chips update together.
5. Empty filter combinations clear marks and show non-misleading empty states without `NaN`, duplicated orders, inaccessible controls or JavaScript exceptions.
6. Chart axes, legend, fills, selected states and flow links are visible in **both themes**. Check scrolling/keyboard controls at desktop and 390 px. Confirm reduced-motion preference and focus visibility.
7. Check mobile charts don't cause the whole page to overflow. The Sankey diagram itself may scroll horizontally within its panel.

Document output and failures as observed; correct any issues before accepting WU-03. The acceptance checklist is a gate; tests passing alone is not proof of visual accessibility.

## Known issues / planned limitations

- WU-03 does **not** include TanStack order explorer, detail drawer or WU-04 integration acceptance.
- Map's P0 measure is distinct eligible orders only; no P1 rate/median choropleths, geospatial GPS or shipment routes.
- Sankey P0 weight is matching item count only. Switching to freight/value remains P1.
- Selecting a Sankey link applies seller+customer filters; it narrows subsequent visible flows. Clearing the state filters restores the full top-15 exploration view.
- Initial map fetch adds a separate fourth asset request in addition to `orders.json`, `items.json`, `metadata.json`.
- `package-lock.json` must be refreshed via a successful local `npm install` and reviewed before commit.

## Next allowed work

After local typecheck, Vitest, Node, production build and human chart visual acceptance pass, commit only the reviewed WU-03 additions/changes on `feature/dashboard-poc`. Do not proceed to WU-04 until WU-03 is accepted.
