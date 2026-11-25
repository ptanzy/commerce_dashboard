"""Local-only structured operational messages for offline preprocessing CLIs.

Structured stderr events deliberately omit archive paths, raw rows and exceptions.
The existing JSON summary on stdout remains the source-of-truth build report.
"""
from datetime import datetime, timezone
import json
import math
import sys
from typing import Literal

Stage = Literal["data", "geography"]
Level = Literal["info", "error"]
Code = Literal["PIPELINE_STARTED", "PIPELINE_COMPLETED", "PIPELINE_FAILED"]


def emit_pipeline_event(stage: Stage, level: Level, code: Code,
                        elapsed_ms: float | None = None, rows: int | None = None) -> None:
    message: dict[str, object] = {
        "time": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "stage": stage, "level": level, "code": code,
    }
    if elapsed_ms is not None and math.isfinite(elapsed_ms) and elapsed_ms >= 0:
        message["elapsedMs"] = round(elapsed_ms, 2)
    if isinstance(rows, int) and not isinstance(rows, bool) and rows >= 0:
        message["rows"] = rows
    print(json.dumps(message, separators=(",", ":")), file=sys.stderr, flush=True)
