# WU-10 Phase 3B — Geographic SVG complexity reduction

## Evidence and rationale

The production browser probe v2 recorded 65 geographic interactions with P95 two-rAF proxies of 318–648 ms and main-thread long tasks near those interactions. The prior fix cached `geoMercator` projection work and did not resolve the delay. The committed TopoJSON asset contained **130,927 quantized boundary vertices** across 284 arcs (27 Brazilian states). A 524 × 445 SVG does not need this level of detail for an on-screen choropleth. Repainting tens of thousands of path segments as all fills change is a plausible performance cost; browser tracing has not conclusively attributed the long tasks to SVG painting.

## Change

- Preserve the same source attribution, `public/geo/brazil-states.topojson` path, 27 UF identifiers, 284 arcs, polygon/hole nesting, TopoJSON transform, and validated ring windings.
- Generate a **display-optimized TopoJSON** offline in `scripts/prepare_geo.py`: nonrecursive Ramer-Douglas-Peucker simplification of each closed ring at 2,500 quantization units (0.025 degrees, roughly one-third of a pixel at typical Brazil map width).
- Keep ring closure, topology references, and starting vertices stable. Reject a simplified ring and keep its original coordinates if it degenerates, changes winding, or changes its signed area by over 0.5%.
- Reduce the committed map asset from approximately 1.27 MB / 130,927 points to approximately **201 KB / 18,882 points**, without changing React controls, dataset semantics, map filters, or API requests. The immutable source is the pinned upstream GeoJSON referenced in `docs/DATA_PROVENANCE.md`. Running the existing geography generator again produces the optimized asset automatically.
- Add `tests/test_wu10_map_geometry.py` for valid states, topology references, winding, idempotence, and a geometry-size budget.

**Limitations:** simplification is lossy and optimized for the existing state-level display, not for precision GIS, geography measurements, exports, or higher zoom levels. The newly generated asset must be visually inspected on the actual dashboard. The change is a hypothesis-driven performance optimization, not yet demonstrated to meet the 250 ms threshold in the user's browser.

## Validation and local acceptance

```powershell
npm run typecheck
npm test
npm run test:node
python -m unittest discover -s tests -p "test_*.py" -v
npm run security:static
npm run build
npm run preview
```

Run `scripts/wu10_browser_probe.js` in the production preview and repeat 15–20 switches per map metric and geographic mode. Verify 27 states, boundaries, labels, low-sample neutral fills, multi-select, focus highlighting, and both themes. Compare geographic control P95 against the prepatch values (on-time 648.3 ms, median 415.9 ms, volume 320.5 ms; modes 376.4 and 317.9 ms). Record the longest overlapping long tasks and heap readings; use DevTools Performance screenshots to confirm actual visual highlight time. Keep uncommitted until accepted.

If map metric P95 still exceeds 250 ms, capture a Chrome/Edge Performance trace to distinguish JS aggregation, SVG repaint, and unrelated main-thread work before making another code change.
