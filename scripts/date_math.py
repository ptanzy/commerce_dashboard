"""Pure helpers used by WU-01's DuckDB-backed preparation pipeline.

Olist timestamps are source-naive: never attach a Z or convert via viewer timezone.
"""
from __future__ import annotations

from datetime import datetime, date
from decimal import Decimal, InvalidOperation
import re


def parse_source_timestamp(value: object) -> datetime | None:
    if value is None or not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip())
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        return None  # Olist fields are timezone-naive; reject unexpected offsets.
    return parsed


def normalized_timestamp(value: datetime | None) -> str | None:
    return value.isoformat(timespec="seconds") if value is not None else None


def parse_source_calendar_date(value: object) -> date | None:
    parsed = parse_source_timestamp(value)
    return parsed.date() if parsed is not None else None


def parse_brl(value: object) -> float | None:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    try:
        amount = Decimal(raw)
    except InvalidOperation:
        return None
    if not amount.is_finite() or amount < 0:
        return None
    return float(amount)


def normalize_category_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")


def category_key(portuguese: str | None, english: str | None) -> str:
    if not portuguese or not portuguese.strip():
        return "unknown"
    if english and (english_key := normalize_category_key(english)):
        return english_key
    key = normalize_category_key(portuguese)
    return f"untranslated:{key}" if key else "unknown"


def classify_order(
    status: str, purchase: datetime | None, actual: datetime | None,
    estimate: date | None,
) -> tuple[float | None, int | None, str]:
    """Return (fractional delivery days, calendar-date delta, classification)."""
    if status != "delivered" or purchase is None or actual is None or actual < purchase:
        return None, None, "unknown"
    elapsed_days = (actual - purchase).total_seconds() / 86400
    if estimate is None:
        return elapsed_days, None, "unknown"
    day_delta = (actual.date() - estimate).days
    classification = "early" if day_delta < 0 else "late" if day_delta > 0 else "on_time"
    return elapsed_days, day_delta, classification


def is_uf(value: str | None) -> bool:
    return isinstance(value, str) and bool(re.fullmatch(r"[A-Z]{2}", value))
