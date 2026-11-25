"""WU-09: adversarial ETL and security guardrail tests; no network or user data."""
from __future__ import annotations

from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import prepare_data as etl
import security_scan


class ZipInputHardeningTests(unittest.TestCase):
    def make_zip(self, path: Path, *, prefix: str = "", duplicate=False, payload=b"header\nvalue\n"):
        with ZipFile(path, "w", compression=ZIP_DEFLATED) as z:
            for filename, _ in etl.INPUTS.values():
                z.writestr(prefix + filename, payload)
            if duplicate:
                z.writestr("extra/" + etl.INPUTS["orders"][0], payload)

    def test_normal_zip_extracts_only_six_expected_names(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / "input.zip"
            self.make_zip(archive, prefix="nested/")
            with etl.input_paths(archive) as (paths, checksum):
                self.assertEqual(set(paths), set(etl.INPUTS))
                self.assertTrue(all(p.parent != archive.parent for p in paths.values()))
                self.assertTrue(all(p.read_bytes() == b"header\nvalue\n" for p in paths.values()))
                self.assertEqual(len(checksum), 64)
            self.assertEqual(list(Path(tmp).glob("*.csv")), [])

    def test_traversal_prefix_cannot_write_outside_temporary_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / "input.zip"
            self.make_zip(archive, prefix="../../outside/")
            with etl.input_paths(archive) as (paths, _):
                self.assertTrue(all(path.name in [x[0] for x in etl.INPUTS.values()] for path in paths.values()))
            self.assertFalse((Path(tmp) / "outside").exists())

    def test_duplicate_csv_basename_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / "input.zip"
            self.make_zip(archive, duplicate=True)
            with self.assertRaisesRegex(ValueError, "exactly one"):
                with etl.input_paths(archive):
                    pass

    def test_zip_bomb_ratio_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / "input.zip"
            self.make_zip(archive, payload=b"A" * 200_000)
            with self.assertRaisesRegex(ValueError, "compression ratio"):
                with etl.input_paths(archive):
                    pass

    def test_excessive_member_count_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / "input.zip"
            self.make_zip(archive)
            with patch.object(etl, "MAX_ARCHIVE_MEMBERS", 3):
                with self.assertRaisesRegex(ValueError, "too many entries"):
                    with etl.input_paths(archive):
                        pass

    def test_actual_decompressed_bytes_are_bounded(self):
        with patch.object(etl, "MAX_SOURCE_CSV_BYTES", 3):
            with self.assertRaisesRegex(ValueError, "Decompressed CSV"):
                etl.copy_csv_bounded(BytesIO(b"123456"), BytesIO())

    def test_zip_metadata_and_symlink_entries_rejected(self):
        info = ZipInfo("olist_orders_dataset.csv")
        info.file_size = etl.MAX_SOURCE_CSV_BYTES + 1
        with self.assertRaisesRegex(ValueError, "allowed size"):
            etl.safe_zip_entry(info)
        info.file_size = -1
        with self.assertRaisesRegex(ValueError, "Invalid CSV archive member size"):
            etl.safe_zip_entry(info)
        info.file_size = 1
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        with self.assertRaisesRegex(ValueError, "Symlink"):
            etl.safe_zip_entry(info)

    def test_directory_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)
            for filename, _ in etl.INPUTS.values():
                (source / filename).write_text("header\n", encoding="utf-8")
            (source / etl.INPUTS["items"][0]).unlink()
            try:
                (source / etl.INPUTS["items"][0]).symlink_to(source / etl.INPUTS["orders"][0])
            except (OSError, NotImplementedError):
                self.skipTest("Symlinks require extra privileges on this platform")
            with self.assertRaisesRegex(ValueError, "unsafe"):
                with etl.input_paths(source):
                    pass


class SourceGuardrailTests(unittest.TestCase):
    def test_flags_xss_sinks_and_secrets_without_disclosing_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "src").mkdir()
            (root / "src" / "bad.ts").write_text("el.innerHTML = userInput;\nconst api_key = 'TOP_SECRET_PRIVATE_KEY_123456';\n")
            findings = security_scan.scan(root, ["src/bad.ts"], git_inventory=False)
            self.assertEqual({x["rule"] for x in findings}, {"unsafe-html-sink", "possible-hardcoded-secret"})
            self.assertNotIn("TOP_SECRET_PRIVATE_KEY", str(findings))

    def test_flags_tracked_data_but_not_ignored_local_data(self):
        paths = ["public/data/orders.json", "data/raw/olist.zip", "src/domain/savedViews.ts"]
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(sum(x["rule"] == "private-artifact-tracked" for x in security_scan.scan(Path(tmp), paths, git_inventory=True)), 2)
            self.assertEqual(security_scan.scan(Path(tmp), paths, git_inventory=False), [])


if __name__ == "__main__":
    unittest.main()
