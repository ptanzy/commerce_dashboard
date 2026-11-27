"""WU-12 operational enrichment: pure ETL schema/normalization compatibility tests."""
import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from prepare_data import optional_order_milestone_projection
from date_math import normalized_timestamp, parse_source_timestamp


class MilestoneExportTests(unittest.TestCase):
    def test_real_olist_milestones_are_allowlisted(self):
        self.assertEqual(optional_order_milestone_projection({
            'order_id', 'order_approved_at', 'order_delivered_carrier_date'}),
            ('o.order_approved_at','o.order_delivered_carrier_date'))

    def test_legacy_fixture_headers_keep_export_possible(self):
        self.assertEqual(optional_order_milestone_projection({'order_id'}), ('NULL','NULL'))
        self.assertEqual(optional_order_milestone_projection({'order_approved_at'}),
                         ('o.order_approved_at','NULL'))

    def test_malformed_header_does_not_enter_sql(self):
        approved, carrier = optional_order_milestone_projection({
            'order_approved_at; DROP TABLE orders', 'order_delivered_carrier_date'})
        self.assertEqual(approved,'NULL')
        self.assertEqual(carrier,'o.order_delivered_carrier_date')

    def test_source_naive_timestamp_roundtrip_and_offset_rejection(self):
        t=parse_source_timestamp('2018-01-02 13:04:05')
        self.assertEqual(normalized_timestamp(t),'2018-01-02T13:04:05')
        self.assertIsNone(parse_source_timestamp('2018-01-02T13:04:05+03:00'))
        self.assertIsNone(parse_source_timestamp('not-a-date'))


if __name__ == '__main__':
    unittest.main()
