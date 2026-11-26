"""WU-10 Phase 3B: map rendering geometry budget and validation.

No client dataset files or external network are needed.
"""
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from prepare_geo import simplify_topology, validate_topology


class MapSimplificationTests(unittest.TestCase):
    def test_committed_asset_contains_all_states_with_small_geometry_budget(self):
        topo = json.loads((ROOT / 'public/geo/brazil-states.topojson').read_text(encoding='utf-8'))
        result = validate_topology(topo)
        points = sum(map(len, topo['arcs']))
        self.assertEqual(result['states'], 27)
        self.assertEqual(result['arcs'], 284)
        self.assertLess(points, 25_000)
        self.assertLess(result['bytes'], 300_000)

    def test_simplification_preserves_winding_closure_and_uf_ids(self):
        topo = json.loads((ROOT / 'public/geo/brazil-states.topojson').read_text(encoding='utf-8'))
        simplified = simplify_topology(topo)
        self.assertEqual(validate_topology(simplified)['states'], 27)
        self.assertEqual(topo['objects'], simplified['objects'])
        self.assertEqual(topo['transform'], simplified['transform'])
        self.assertEqual(topo['arcs'], simplified['arcs'])  # idempotent on generated asset

    def test_closed_irregular_ring_reduces_and_keeps_geometry_valid(self):
        # Synthetic 27-state TopoJSON: many tiny zigzags along a bounding box.
        from prepare_geo import STATES
        codes = sorted(STATES)
        arcs = []
        for i, code in enumerate(codes):
            x0 = (i + 1) * 100_000
            vertices = [(x0, 0)]
            vertices.extend((x0 + j * 100, (j % 2) * 10) for j in range(1, 100))
            vertices.extend([(x0 + 10_000, 0), (x0 + 10_000, -10_000), (x0, -10_000), (x0, 0)])
            # Ring is clockwise in x-east, y-north coordinates.
            previous = (0, 0)
            encoded = []
            for point in vertices:
                encoded.append([point[0] - previous[0], point[1] - previous[1]])
                previous = point
            arcs.append(encoded)
        topo = {'type': 'Topology', 'transform': {'scale': [1e-5, 1e-5], 'translate': [-180, -90]},
                'objects': {'estados': {'type': 'GeometryCollection',
                           'geometries': [{'type': 'Polygon', 'id': code, 'arcs': [[i]]}
                                          for i, code in enumerate(codes)]}},
                'arcs': arcs}
        self.assertEqual(validate_topology(topo)['states'], 27)
        simplified = simplify_topology(topo)
        self.assertEqual(validate_topology(simplified)['states'], 27)
        self.assertLess(sum(map(len, simplified['arcs'])), sum(map(len, arcs)) / 10)
        for before, after in zip(arcs, simplified['arcs']):
            self.assertEqual(after[0], before[0])
            self.assertGreaterEqual(len(after), 4)

    def test_rejects_excessive_tolerance(self):
        with self.assertRaisesRegex(ValueError, 'tolerance'):
            simplify_topology({'arcs': []}, 50_000)


if __name__ == '__main__':
    unittest.main()
