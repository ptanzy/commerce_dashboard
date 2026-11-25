WU-09 — Fix black focus box around Sankey ribbons

CAUSE
The previous Ctrl/Cmd-click accessibility patch inserted focusable SVG paths for
ribbon hit testing. In Edge, a focused SVG path may receive the browser's
default rectangular focus outline around its entire bounding box. That draws
a large black rectangle around the diagram when a ribbon is clicked.

FIX
- Turn off the browser's default SVG outline on these hit targets.
- Add an explicit ribbon-shaped :focus-visible highlight for keyboard focus.
- Preserve Ctrl/Cmd-click additive selection, plain-click replacement, the
  keyboard Enter/Space actions, and the existing focus chips/filter semantics.

FILES
  src/charts/ShippingSankey.tsx
  src/styles/index.css
  tests/ui/wu07.test.tsx

APPLY
Extract this ZIP into the repository root, preserving directories, after
the WU-09 Sankey Ctrl/Cmd-click fix. Replace the three files above.

VALIDATE
  npm run typecheck
  npm test
  npm run test:node
  npm run build

MANUAL EDGE CHECK
1. Click a Sankey ribbon: no rectangular black box should appear.
2. Ctrl-click a second ribbon: both remain selected.
3. Ctrl-click one selected ribbon: it toggles off.
4. Use Tab to focus a ribbon: a gold ribbon-shaped focus indicator appears.
5. Press Enter/Space on the focused ribbon: selection changes.

No analytics/selector/filter logic changes. No dataset changes.
