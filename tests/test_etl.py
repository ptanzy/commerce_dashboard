"""Python standard-library and optional DuckDB integration checks for WU-01.

Run: python -m unittest discover -s tests -p 'test_*.py' -v
"""
from __future__ import annotations

import json
import csv
from datetime import datetime, date
from io import StringIO
from pathlib import Path
import sys
import tempfile
import unittest
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from date_math import (category_key, classify_order, normalized_timestamp, parse_brl, parse_source_timestamp)
from prepare_geo import convert_geojson, validate_topology, STATES

try:
    import duckdb  # noqa: F401
    DUCKDB_AVAILABLE = True
except ImportError:
    DUCKDB_AVAILABLE = False


class DateAndMoneyTests(unittest.TestCase):
    def test_calendar_cutoff_is_inclusive(self):
        bought = datetime(2018, 2, 1, 10)
        delivered = datetime(2018, 2, 5, 23, 59)
        elapsed, delta, label = classify_order('delivered', bought, delivered, date(2018,2,5))
        self.assertEqual(delta, 0)
        self.assertEqual(label, 'on_time')
        self.assertAlmostEqual(elapsed, 4.5826388888, places=5)

    def test_incoherent_date_forces_unknown(self):
        self.assertEqual(classify_order('delivered', datetime(2018,1,2), datetime(2018,1,1), date(2018,1,3)),(None,None,'unknown'))

    def test_no_estimate_still_has_valid_duration(self):
        duration, delta, label = classify_order('delivered', datetime(2018,1,1), datetime(2018,1,2), None)
        self.assertEqual((duration,delta,label),(1.0,None,'unknown'))

    def test_source_naive_timestamp(self):
        stamp = parse_source_timestamp('2018-01-02 03:04:05')
        self.assertEqual(normalized_timestamp(stamp),'2018-01-02T03:04:05')
        self.assertIsNone(parse_source_timestamp('2018-01-02T03:04:05Z'))
        self.assertIsNone(parse_source_timestamp('not-a-date'))

    def test_financial_null_and_zero(self):
        self.assertEqual(parse_brl('0'),0.0)
        self.assertEqual(parse_brl('4.10'),4.1)
        for raw in ('', None, '-1','NaN','Infinity','oops'):
            self.assertIsNone(parse_brl(raw))

    def test_category_fallback(self):
        self.assertEqual(category_key('beleza_saude','health_beauty'),'health_beauty')
        self.assertEqual(category_key('pc_gamer',None),'untranslated:pc_gamer')
        self.assertEqual(category_key(None,None),'unknown')


class GeoTests(unittest.TestCase):
    def test_convert_and_validate_exact_27(self):
        features = []
        for i, code in enumerate(sorted(STATES)):
            x = -80 + i
            ring = [[x, -10], [x+0.5,-10], [x+0.5,-9.5], [x,-9.5], [x,-10]]
            features.append({'type':'Feature','id':code,'properties':{'SIGLA':code,'Estado':code,'Total':100},'geometry':{'type':'Polygon','coordinates':[ring]}})
        topology = convert_geojson({'type':'FeatureCollection','features':features})
        result=validate_topology(topology)
        self.assertEqual(result['states'],27)
        self.assertEqual(result['arcs'],27)
        self.assertEqual(topology['objects']['estados']['geometries'][0]['properties'],{'SIGLA':'AC','Estado':'AC'})
        # TopoJSON standard: Polygon.arcs = [[arcId], ...], not [arcId].
        first = topology['objects']['estados']['geometries'][0]
        self.assertEqual(first['arcs'], [[0]])
        self.assertIsInstance(first['arcs'][0], list)
        with self.assertRaisesRegex(ValueError, 'TopoJSON ring'):
            broken = json.loads(json.dumps(topology))
            broken['objects']['estados']['geometries'][0]['arcs'] = [0]
            validate_topology(broken)
        self.assertNotIn('Total',str(topology))
        with self.assertRaises(ValueError):
            convert_geojson({'type':'FeatureCollection','features':features[:-1]})

    def test_quantization_drops_only_collapsed_micro_polygons(self):
        """Pernambuco's real source contains tiny valid triangles erased by 1e-5 rounding."""
        features = []
        for i, code in enumerate(sorted(STATES)):
            x = -75 + i
            main = [[x,-10],[x+0.5,-10],[x+0.5,-9.5],[x,-9.5],[x,-10]]
            geometry = {'type':'Polygon','coordinates':[main]}
            if code == 'PE':
                # Valid raw triangle whose vertices collapse to two after rounding.
                a = [-35.82448433736107, -8.378706655889504]
                tiny = [a, [a[0]+0.000001, a[1]],
                        [a[0]+0.000001, a[1]+0.000001], a]
                geometry = {'type':'MultiPolygon','coordinates':[[main], [tiny]]}
            features.append({'type':'Feature','id':code,'properties':{'SIGLA':code},'geometry':geometry})
        diagnostics = {}
        topology = convert_geojson({'type':'FeatureCollection','features':features}, diagnostics=diagnostics)
        self.assertEqual(validate_topology(topology)['states'], 27)
        self.assertEqual(diagnostics['collapsedPolygons'],1)
        self.assertEqual(diagnostics['collapsedHoles'],0)
        pe = next(g for g in topology['objects']['estados']['geometries'] if g['id']=='PE')
        self.assertEqual(len(pe['arcs']), 1)
        self.assertEqual(len(pe['arcs'][0]), 1)
        self.assertEqual(len(pe['arcs'][0][0]), 1)

    def test_rewinds_d3_exterior_and_hole_rings_after_quantization(self):
        """Prevents tiny inverted polygons from filling the whole Mercator frame."""
        features = []
        for i, code in enumerate(sorted(STATES)):
            x = -75 + i
            # Source exterior is counterclockwise, contrary to D3's rule.
            exterior = [[x, -10], [x+0.5, -10], [x+0.5, -9.5],
                        [x, -9.5], [x, -10]]
            geometry = {'type': 'Polygon', 'coordinates': [exterior]}
            if code == 'PE':
                # Source hole is clockwise, contrary to D3's rule.
                hole = [[x+.1, -9.9], [x+.1, -9.6], [x+.4, -9.6],
                        [x+.4, -9.9], [x+.1, -9.9]]
                # A second tiny polygon is still drawable but has the wrong
                # winding; this mirrors the real Pernambuco micro-polygons.
                tiny = [[-35, -8], [-34.999, -8], [-34.9995, -7.999], [-35, -8]]
                geometry = {'type': 'MultiPolygon', 'coordinates': [[exterior, hole], [tiny]]}
            features.append({'type': 'Feature', 'id': code,
                             'properties': {'SIGLA': code}, 'geometry': geometry})
        diagnostics = {}
        topology = convert_geojson({'type': 'FeatureCollection', 'features': features}, diagnostics=diagnostics)
        self.assertEqual(validate_topology(topology)['states'], 27)
        self.assertGreater(diagnostics['rewoundExteriorRings'], 0)
        self.assertEqual(diagnostics['rewoundHoleRings'], 1)
        pe = next(g for g in topology['objects']['estados']['geometries'] if g['id'] == 'PE')
        self.assertEqual(len(pe['arcs']), 2)
        self.assertEqual(len(pe['arcs'][0]), 2)
        # Verify the validator rejects a reverse-wound arc, not just malformed
        # nesting or non-closed coordinate rings.
        broken = json.loads(json.dumps(topology))
        first_ring_arc = pe['arcs'][0][0][0]
        encoded = broken['arcs'][first_ring_arc]
        x = y = 0
        raw = []
        for dx, dy in encoded:
            x += dx
            y += dy
            raw.append((x, y))
        raw.reverse()
        previous = (0, 0)
        reversed_arc = []
        for point in raw:
            reversed_arc.append([point[0] - previous[0], point[1] - previous[1]])
            previous = point
        broken['arcs'][first_ring_arc] = reversed_arc
        with self.assertRaisesRegex(ValueError, 'winding'):
            validate_topology(broken)

    def test_unclosed_source_ring_is_not_silently_discarded(self):
        features = []
        for i, code in enumerate(sorted(STATES)):
            x = -75+i
            ring = [[x,-10],[x+0.5,-10],[x+0.5,-9.5],[x,-9.5],[x,-10]]
            if code == 'PE':
                ring = ring[:-1]  # GeoJSON source is genuinely invalid, not tiny.
            features.append({'type':'Feature','id':code,'properties':{'SIGLA':code},
                             'geometry':{'type':'Polygon','coordinates':[ring]}})
        with self.assertRaisesRegex(ValueError, 'Malformed'):
            convert_geojson({'type':'FeatureCollection','features':features})


def csv_bytes(rows, fields):
    buffer = StringIO()
    writer = csv.DictWriter(buffer,fieldnames=fields,lineterminator='\n')
    writer.writeheader();writer.writerows(rows)
    return buffer.getvalue().encode('utf-8')


@unittest.skipUnless(DUCKDB_AVAILABLE,'DuckDB package not available in this execution environment')
class DuckDBIntegrationTests(unittest.TestCase):
    def test_full_zip_export_join_grains_and_metric_eligibility(self):
        from prepare_data import prepare
        order_ids = [f'o{i}' for i in range(1, 11)]
        orders = []
        statuses = ['delivered','delivered','delivered','delivered','created','canceled','delivered','delivered','delivered','delivered']
        actual = ['2018-01-05 21:00:00','2018-01-03 12:00:00','2018-01-08 12:00:00','2018-01-01 10:00:00','','','2018-01-05 12:00:00','2018-01-05 12:00:00','2018-01-05 12:00:00','2018-02-01 09:00:00']
        for i, order_id in enumerate(order_ids):
            orders.append({'order_id':order_id,'customer_id':f'c{i+1}','order_status':statuses[i],
                'order_purchase_timestamp':'2018-01-02 10:00:00' if i<9 else '2018-01-30 10:00:00',
                'order_delivered_customer_date':actual[i],
                'order_estimated_delivery_date':'2018-01-05 00:00:00' if i != 8 else ''})
        raw_items = [
            ('o1','1','p1','s1','100.00','10.00'), ('o1','2','p2','s2','200.00','20.00'),
            ('o1','3','p1','s1','50.00','5.00'), ('o2','1','p1','s1','20.00','0'),
            ('o3','1','p2','s2','30','3'),('o4','1','p1','s1','10','1'),
            ('o7','1','p1','s1','0','0'),('o8','1','p3','s1','bad','4'),
            ('o9','1','p1','s1','10','1'), ('o10','1','p4','s2','10','2')]
        items = [dict(zip(('order_id','order_item_id','product_id','seller_id','price','freight_value'),row)) for row in raw_items]
        customers = [{'customer_id':f'c{i+1}','customer_state':'MG' if i == 0 else 'SP'} for i in range(10)]
        sellers = [{'seller_id':'s1','seller_state':'SP'},{'seller_id':'s2','seller_state':'RJ'}]
        products = [{'product_id':'p1','product_category_name':'eletronicos'},
                    {'product_id':'p2','product_category_name':'moveis'},
                    {'product_id':'p3','product_category_name':''},
                    {'product_id':'p4','product_category_name':'pc_gamer'}]
        translations = [{'product_category_name':'eletronicos','product_category_name_english':'electronics'},
                        {'product_category_name':'moveis','product_category_name_english':'furniture'}]
        tables = {
            'olist_orders_dataset.csv':(orders,list(orders[0])),
            'olist_order_items_dataset.csv':(items,list(items[0])),
            'olist_customers_dataset.csv':(customers,list(customers[0])),
            'olist_sellers_dataset.csv':(sellers,list(sellers[0])),
            'olist_products_dataset.csv':(products,list(products[0])),
            'product_category_name_translation.csv':(translations,list(translations[0])),
        }
        with tempfile.TemporaryDirectory() as temp:
            archive = Path(temp)/'olist.zip'
            with ZipFile(archive,'w') as handle:
                for filename,(rows,header) in tables.items(): handle.writestr(filename,csv_bytes(rows,header))
            out = Path(temp)/'out'
            report = prepare(archive,out)
            import json
            pointer = json.loads((out/'current.json').read_text())
            published = out / 'generations' / pointer['generation']
            generated_orders = json.loads((published/'orders.json').read_text())
            generated_items = json.loads((published/'items.json').read_text())
            self.assertEqual((len(generated_orders),len(generated_items)),(10,10))
            self.assertEqual(report['manifest']['invalidCounts']['invalidItemPrice'],1)
            by_id = {o['orderId']:o for o in generated_orders}
            self.assertEqual(by_id['o1']['itemCount'],3)
            self.assertEqual(by_id['o5']['itemCount'],0)
            self.assertEqual((by_id['o1']['deliveryClassification'],by_id['o1']['deliveryDayDelta']),('on_time',0))
            self.assertEqual(by_id['o4']['deliveryClassification'],'unknown')
            self.assertIsNone(by_id['o4']['deliveryDays'])
            self.assertEqual(by_id['o9']['deliveryClassification'],'unknown')
            self.assertIsNotNone(by_id['o9']['deliveryDays'])
            self.assertEqual({x['category'] for x in generated_items if x['orderId']=='o1'},{'electronics','furniture'})
            self.assertEqual(next(x for x in generated_items if x['orderId']=='o10')['category'],'untranslated:pc_gamer')
            self.assertEqual(next(x for x in generated_items if x['orderId']=='o8')['category'],'unknown')
            self.assertIsNone(next(x for x in generated_items if x['orderId']=='o8')['priceBRL'])


if __name__ == '__main__': unittest.main()
