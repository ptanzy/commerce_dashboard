# WU-00 — Data Provenance and Geography Decision

## Olist source

- Dataset: **Brazilian E-Commerce Public Dataset by Olist**, https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce
- Publisher-listed license: **CC BY-NC-SA 4.0**, Attribution–NonCommercial–ShareAlike 4.0 International.
- ZIP actually profiled: uploaded `archive.zip`, SHA-256 `967e41e04fc306fe604e2a693f488995a8b41e5047418f8a5c8e4abd6deca784`.
- Intended local source path: `data/raw/olist.zip`, not independently verified as byte-identical to the upload.
- Local-only, noncommercial POC approved scope. Do not commit source CSVs or row-level derived data to the public repo; preserve `/data/raw/`, `/data/processed/`, `/public/data/` in `.gitignore`.
- Suggested attribution: “Historical Brazilian e-commerce data: Olist, via Kaggle (CC BY-NC-SA 4.0).”
- Dataset does **not** include physical transport routes, carrier IDs, or observed carrier operating expenses. `freight_value` is a customer item-level freight charge.

## Selected state boundary source

**Original upstream:** https://github.com/giuliano-macedo/geodata-br-states

- **Pinned source commit:** `32d7169859c5dad3bd7ae4f2710733b96b02d40f`
- **License:** MIT, copyright © 2023 Giuliano Oliveira de Macedo. Upstream `LICENSE` blob SHA: `f28e07403de6cef525e4bfb95451ec6d45fd3a1c`. Preserve copyright/license text and attribution.
- **Original boundaries credited by upstream:** LAGEAMB / UFPR.
- **Composite GeoJSON:** `geojson/br_states.json`, upstream Git blob SHA `b4a0eca5385d06ca3c53823b656f7e8fdb6dfc6b`, listed size **5,607,031 bytes**.
- **Per-state source:** `geojson/br_states/br_<uf>.json`. Directory listing at the pinned commit verified **exactly 27 files**, named for every Brazilian UF code:
  `AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO`.
- **Identifier sample verification:** Parsed complete per-state source for DF and AL. Each is a `FeatureCollection` with one `MultiPolygon` and properties `SIGLA` = the two-letter code, `Estado` = state name, and feature `id` equal to code.
- **Mapping:** Preserve/validate `properties.SIGLA` or feature `id` → Olist's two-letter `seller_state`/`customer_state`. All Olist source codes appear in the 27-file list.
- **Implementation:** Fetch pinned GeoJSON, validate 27 unique features, strip legacy demographic properties, simplify and convert to `public/geo/brazil-states.topojson` with `objects.estados` and stable UF IDs. Calculate resulting file SHA-256 and test topology feature count / arc integrity after conversion.
- **WU-10 display-complexity update (2026-11-25):** The offline geography generator now applies bounded ring simplification after quantization (2,500 units / 0.025°, maximum 0.5% area difference per ring; rejects degeneracy or winding reversal). The same 27 UF IDs, 284 arc references, geography source, and MIT attribution remain. The committed TopoJSON was reduced from 130,927 to 18,882 points for faster static SVG painting; see `WU10_PHASE3B_MAP_RENDER_COMPLEXITY.md`. The regenerated file checksum is different from the previous unsimplified export.

### Open geography acceptance gate

The pinned source, MIT license, 27-file inventory, code mapping and DF/AL feature samples **were verified**. However, the final combined TopoJSON **has not been generated or validated**. Its final SHA-256 and actual renderability are not yet known. The strict WU-00 geographic-output exit gate is thus **not fully passed**.

A practical owner decision is to allow **WU-01** to build and validate the compact TopoJSON from the pinned MIT source, while keeping the WU-03 chart gate blocked until that validation passes. This does not add a runtime dependency or an extra work unit.

## Source links

- Olist dataset and license: https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce
- Upstream geography: https://github.com/giuliano-macedo/geodata-br-states
- Geography LICENSE: https://github.com/giuliano-macedo/geodata-br-states/blob/32d7169859c5dad3bd7ae4f2710733b96b02d40f/LICENSE
- Geometry source: https://github.com/giuliano-macedo/geodata-br-states/tree/32d7169859c5dad3bd7ae4f2710733b96b02d40f/geojson

**No dataset or geographic polygons were added to GitHub during WU-00.**
