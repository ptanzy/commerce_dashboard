"""WU-08 operational logging privacy and format contract."""
from contextlib import redirect_stderr
import io
import json
import unittest
from scripts.ops_logging import emit_pipeline_event


class PipelineObservabilityTests(unittest.TestCase):
    def test_pipeline_events_are_structured_and_contain_no_paths_or_source_rows(self):
        output = io.StringIO()
        with redirect_stderr(output):
            emit_pipeline_event("data", "info", "PIPELINE_COMPLETED", 12.345, 100)
        event = json.loads(output.getvalue())
        self.assertEqual(event["stage"], "data")
        self.assertEqual(event["elapsedMs"], 12.35)
        self.assertEqual(event["rows"], 100)
        self.assertEqual(set(event), {"time", "stage", "level", "code", "elapsedMs", "rows"})

    def test_invalid_numeric_diagnostics_are_not_exported(self):
        output = io.StringIO()
        with redirect_stderr(output):
            emit_pipeline_event("geography", "error", "PIPELINE_FAILED", float("nan"), -4)
        event = json.loads(output.getvalue())
        self.assertNotIn("elapsedMs", event)
        self.assertNotIn("rows", event)


if __name__ == "__main__":
    unittest.main()
