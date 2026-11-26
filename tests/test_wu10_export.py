"""WU-10 failure injection for per-file ETL asset writes (no DuckDB needed)."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from prepare_data import write_json, publish_dataset


class ExportInterruptionTests(unittest.TestCase):
    def test_serialization_failure_preserves_previous_file_and_removes_temp(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'orders.json'
            target.write_text('previous-generation', encoding='utf-8')
            with self.assertRaises(ValueError):
                write_json(target, {'invalid': float('nan')})
            self.assertEqual(target.read_text(encoding='utf-8'), 'previous-generation')
            self.assertEqual(list(Path(directory).glob('*.tmp')), [])

    def test_replace_failure_preserves_previous_file_and_removes_temp(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'items.json'
            target.write_text('previous-generation', encoding='utf-8')
            with patch.object(Path, 'replace', side_effect=PermissionError('injected failure')):
                with self.assertRaisesRegex(PermissionError, 'injected failure'):
                    write_json(target, [{'valid': True}])
            self.assertEqual(target.read_text(encoding='utf-8'), 'previous-generation')
            self.assertEqual(list(Path(directory).glob('*.tmp')), [])

    def test_success_creates_complete_json_without_temp_files(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'metadata.json'
            count = write_json(target, {'schemaVersion': 2})
            self.assertEqual(json.loads(target.read_text(encoding='utf-8')), {'schemaVersion': 2})
            self.assertEqual(count, target.stat().st_size)
            self.assertEqual(list(Path(directory).glob('*.tmp')), [])


class GenerationPublicationTests(unittest.TestCase):
    def test_pointer_commits_only_after_all_three_files_exist(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sizes = publish_dataset(root, [{'orderId': 'one'}], [{'orderId': 'one'}], {'schemaVersion': 2})
            pointer = json.loads((root / 'current.json').read_text())
            folder = root / 'generations' / pointer['generation']
            self.assertEqual(set(sizes), {'orders.json', 'items.json', 'metadata.json'})
            self.assertEqual(json.loads((folder / 'orders.json').read_text())[0]['orderId'], 'one')
            self.assertTrue(all((folder / name).is_file() for name in sizes))
            self.assertFalse(list(root.glob('.stage-*')))

    def test_mid_export_failure_preserves_existing_generation_and_pointer(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            publish_dataset(root, ['first'], [], {'v': 1})
            pointer_before = (root / 'current.json').read_bytes()
            old = json.loads(pointer_before)['generation']
            with self.assertRaises(ValueError):
                publish_dataset(root, ['second'], [], {'invalid': float('nan')})
            self.assertEqual((root / 'current.json').read_bytes(), pointer_before)
            self.assertEqual(json.loads((root / 'generations' / old / 'orders.json').read_text()), ['first'])
            self.assertFalse(list(root.glob('.stage-*')))

    def test_failed_pointer_update_leaves_original_generation_visible(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            publish_dataset(root, ['first'], [], {'v': 1})
            pointer_before = (root / 'current.json').read_bytes()
            real_write = write_json
            def fail_pointer(path, payload):
                if path.name == 'current.json':
                    raise PermissionError('injected commit failure')
                return real_write(path, payload)
            with patch('prepare_data.write_json', side_effect=fail_pointer):
                with self.assertRaisesRegex(PermissionError, 'injected commit failure'):
                    publish_dataset(root, ['second'], [], {'v': 2})
            self.assertEqual((root / 'current.json').read_bytes(), pointer_before)
            self.assertFalse(list(root.glob('.stage-*')))



if __name__ == '__main__':
    unittest.main()
