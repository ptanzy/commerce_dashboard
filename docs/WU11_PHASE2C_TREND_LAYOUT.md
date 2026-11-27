# WU-11 Phase 2C — Paired Delivery Trends height

## User request

When Geographic Distribution is substantially taller than Delivery Trends in the WU-11 section layout, align both card boundaries **and** let the trend visualization itself take advantage of the extra vertical space. Do not stretch text, buttons, or SVG contents.

## Implementation

- Only a chart group containing *both* `geographicDistribution` and `deliveryTrends` receives the `workspace-geo-trend-pair` marker.
- At desktop widths (at least 1191 px, matching the existing two-column chart-grid breakpoint), the Delivery Trends card uses a column flex layout. Only the plot area grows, with a minimum of 220 px and a maximum of 620 px. Caption, metric buttons, month selector, legend, and methodology text keep their natural dimensions.
- The plot uses `ResizeObserver` to measure its actual width/height, changing the SVG **viewBox height** and the D3 vertical scale to match available space. `preserveAspectRatio` remains at its normal behavior: glyphs, labels, and tick geometry are not geometrically stretched. The height of hit regions, highlights and month/year axis positions all follow the vertical plot extent.
- Below the existing 1191 px breakpoint, or if Geographic Distribution is hidden, the trend plot returns to its original 860 × 294 viewBox and ordinary intrinsic height. Without `ResizeObserver`, it remains functionally usable with the original geometry.
- Underlying `monthlyTrendContext`, focused-flow semantics, metric calculations, selected-month behavior, and chart accessibility are unchanged. No new package, data generation, or browser storage is introduced.

## Tests and browser acceptance

1. Run `npm run typecheck`, `npm test -- --maxWorkers=1 --no-file-parallelism`, `npm run test:node`, `npm run security:static`, `npm run build`.
2. In desktop preview with the full Olist dataset, show both Geographic Distribution and Delivery Trends: cards align at their bottoms; the chart uses a substantial part of its card's vertical space; labels, month selector and bottom explanatory text remain legible, not stretched.
3. Switch Order volume / On-time rate and filter a month: the chart retains correct values/selection in the expanded plot.
4. Hide the Geographic Distribution section: Delivery Trends becomes a normal-height single chart; unhide geography: expansion returns.
5. Resize below 1191 px, including mobile sizes. The charts stack, the trend plot returns to natural aspect ratio, and there is no horizontal overflow.
6. Repeat with dark/light themes and zero/low-volume filtered cohorts. Do not commit until accepted.

This change is confined to the Phase 2 visual acceptance gate. Named dashboard persistence is still scheduled for Phase 3.
