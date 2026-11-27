#!/usr/bin/env python3
"""WU-01: reproducible local-only Olist → compact JSON using DuckDB.

Usage: python scripts/prepare_data.py --input data/raw/olist.zip --output public/data
Run from repo root. Requirements: Python 3.12+; pip install -r requirements-etl.txt.
Six required CSVs plus the optional reviews CSV are processed. No geolocation processing. Review comments are never exported.
"""
from __future__ import annotations

from time import perf_counter
from ops_logging import emit_pipeline_event

import argparse
from collections import Counter
from contextlib import contextmanager
import csv
from datetime import date
import hashlib
import json
import math
import os
import shutil
import uuid
from pathlib import Path
import tempfile
from typing import Iterator
from zipfile import ZipFile, ZIP_STORED, ZIP_DEFLATED
from stat import S_IFMT, S_IFLNK

from date_math import (
    category_key, classify_order, is_uf, normalized_timestamp,
    parse_brl, parse_source_calendar_date, parse_source_timestamp,
)

INPUTS = {
    "orders": ("olist_orders_dataset.csv", {"order_id", "customer_id", "order_status", "order_purchase_timestamp", "order_delivered_customer_date", "order_estimated_delivery_date"}),
    "items": ("olist_order_items_dataset.csv", {"order_id", "order_item_id", "product_id", "seller_id", "price", "freight_value"}),
    "customers": ("olist_customers_dataset.csv", {"customer_id", "customer_state"}),
    "sellers": ("olist_sellers_dataset.csv", {"seller_id", "seller_state"}),
    "products": ("olist_products_dataset.csv", {"product_id", "product_category_name"}),
    "translations": ("product_category_name_translation.csv", {"product_category_name", "product_category_name_english"}),
}
REVIEWS_FILENAME = "olist_order_reviews_dataset.csv"
REVIEW_COLUMNS = {"order_id", "review_id", "review_score"}
PROCESSING_VERSION = "wu12-customer-experience-1"
STATES = set("AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split())

# WU-09: bounded ingestion protects the local ETL from malicious/broken archives.
# Thresholds comfortably exceed the verified six-file Olist CSV inventory.
MAX_SOURCE_CSV_BYTES = 128 * 1024 * 1024
MAX_TOTAL_REQUIRED_CSV_BYTES = 384 * 1024 * 1024
MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
MAX_ARCHIVE_MEMBERS = 10_000
MAX_COMPRESSION_RATIO = 200


def safe_zip_entry(info) -> None:
    """Validate only the six selected CSV entries; never extract archive paths."""
    if info.flag_bits & 1:
        raise ValueError("Encrypted CSV entries are not supported")
    if info.compress_type not in (ZIP_STORED, ZIP_DEFLATED):
        raise ValueError("Unsupported CSV compression method")
    if info.create_system == 3 and S_IFMT(info.external_attr >> 16) == S_IFLNK:
        raise ValueError("Symlink ZIP members are not accepted")
    if info.file_size < 0 or info.compress_size < 0:
        raise ValueError("Invalid CSV archive member size")
    if info.file_size > MAX_SOURCE_CSV_BYTES:
        raise ValueError("A required CSV exceeds the allowed size")
    if info.file_size > 0 and info.file_size / max(1, info.compress_size) > MAX_COMPRESSION_RATIO:
        raise ValueError("A required CSV exceeds the allowed compression ratio")


def copy_csv_bounded(inp, out) -> int:
    """Enforce the byte cap on *actual decompressed data*, not ZIP metadata alone."""
    total = 0
    while chunk := inp.read(1 << 20):
        total += len(chunk)
        if total > MAX_SOURCE_CSV_BYTES:
            raise ValueError("Decompressed CSV exceeds the allowed size")
        out.write(chunk)
    return total


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for part in iter(lambda: stream.read(1 << 20), b""):
            h.update(part)
    return h.hexdigest()


@contextmanager
def input_paths(source: Path) -> Iterator[tuple[dict[str, Path], str | None]]:
    """Extract only required CSVs from ZIP to a temporary directory, or use a directory."""
    if source.is_dir():
        paths = {name: source / filename for name, (filename, _) in INPUTS.items()}
        total_bytes = 0
        for name, path in paths.items():
            if not path.is_file() or path.is_symlink():
                raise ValueError(f"Missing or unsafe required {name} CSV")
            size = path.stat().st_size
            if size > MAX_SOURCE_CSV_BYTES:
                raise ValueError("A required CSV exceeds the allowed size")
            total_bytes += size
            if total_bytes > MAX_TOTAL_REQUIRED_CSV_BYTES:
                raise ValueError("Required CSVs exceed the allowed total size")
        review_path = source / REVIEWS_FILENAME
        if review_path.exists() or review_path.is_symlink():
            if not review_path.is_file() or review_path.is_symlink():
                raise ValueError("Unsafe optional reviews CSV")
            if review_path.stat().st_size > MAX_SOURCE_CSV_BYTES:
                raise ValueError("Optional reviews CSV exceeds the allowed size")
            total_bytes += review_path.stat().st_size
            if total_bytes > MAX_TOTAL_REQUIRED_CSV_BYTES:
                raise ValueError("Input CSVs exceed the allowed total size")
            paths["reviews"] = review_path
        yield paths, None
        return
    if not source.is_file() or not source.suffix.lower() == ".zip":
        raise ValueError(f"Supply a ZIP archive or extracted CSV directory: {source}")
    if source.stat().st_size > MAX_ARCHIVE_BYTES:
        raise ValueError("Source ZIP exceeds the allowed archive size")
    with tempfile.TemporaryDirectory(prefix="olist-six-") as tmp, ZipFile(source) as archive:
        members = archive.infolist()
        if len(members) > MAX_ARCHIVE_MEMBERS:
            raise ValueError("Source ZIP has too many entries")
        paths: dict[str, Path] = {}
        total_bytes = 0
        # Do not extract arbitrary archive paths; resolve by basename, reject ambiguity.
        for name, (filename, _) in INPUTS.items():
            matches = [entry for entry in members if not entry.is_dir() and Path(entry.filename).name == filename]
            if len(matches) != 1:
                raise ValueError(f"Expected exactly one {filename} in archive; found {len(matches)}")
            info = matches[0]
            safe_zip_entry(info)
            target = Path(tmp) / filename
            with archive.open(info) as inp, target.open("wb") as out:
                actual_size = copy_csv_bounded(inp, out)
            total_bytes += actual_size
            if total_bytes > MAX_TOTAL_REQUIRED_CSV_BYTES:
                raise ValueError("Required CSVs exceed the allowed total size")
            paths[name] = target
        matches = [entry for entry in members if not entry.is_dir() and Path(entry.filename).name == REVIEWS_FILENAME]
        if len(matches) > 1:
            raise ValueError("Ambiguous reviews CSV in archive")
        if matches:
            info = matches[0]
            safe_zip_entry(info)
            target = Path(tmp) / REVIEWS_FILENAME
            with archive.open(info) as inp, target.open("wb") as out:
                actual_size = copy_csv_bounded(inp, out)
            total_bytes += actual_size
            if total_bytes > MAX_TOTAL_REQUIRED_CSV_BYTES:
                raise ValueError("Input CSVs exceed the allowed total size")
            paths["reviews"] = target
        yield paths, digest(source)


def optional_order_milestone_projection(columns: set[str]) -> tuple[str, str]:
    """Return allowlisted milestone SQL expressions, tolerating older fixture schemas.

    Raw Olist CSVs normally include these fields; legacy export fixtures may not.
    Identifiers are fixed literals and never incorporate untrusted CSV header strings.
    """
    approved = "o.order_approved_at" if "order_approved_at" in columns else "NULL"
    carrier = "o.order_delivered_carrier_date" if "order_delivered_carrier_date" in columns else "NULL"
    return approved, carrier


def validate_headers(paths: dict[str, Path]) -> None:
    for name, path in paths.items():
        with path.open("r", encoding="utf-8-sig", newline="") as source:
            columns = set(next(csv.reader(source), []))
        missing = (REVIEW_COLUMNS if name == "reviews" else INPUTS[name][1]) - columns
        if missing:
            raise ValueError(f"{path.name}: missing required columns {sorted(missing)}")


def ensure_unique(conn, table: str, keys: tuple[str, ...]) -> None:
    cols = ", ".join(keys)
    example = conn.execute(
        f"SELECT {cols}, COUNT(*) AS n FROM {table} GROUP BY {cols} HAVING COUNT(*) > 1 LIMIT 1"
    ).fetchone()
    if example is not None:
        raise ValueError(f"Non-unique source key in {table}: {example}")
    missing = conn.execute(
        f"SELECT COUNT(*) FROM {table} WHERE " + " OR ".join(f"NULLIF(TRIM({key}), '') IS NULL" for key in keys)
    ).fetchone()[0]
    if missing:
        raise ValueError(f"Blank source key in {table}: {missing} rows")


def scalar(conn, query: str) -> int:
    return int(conn.execute(query).fetchone()[0])


def write_json(path: Path, payload: object) -> int:
    """Replace one asset only after a complete serialization; clean up on failure.

    This is atomic PER FILE, not a multi-file transaction. A mid-export process
    termination may still leave a mixed generation. Do not treat successful
    writes here as proof of cross-file consistency.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    candidate: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=path.parent,
            prefix=path.name + ".", suffix=".tmp", delete=False,
        ) as stream:
            candidate = Path(stream.name)
            json.dump(payload, stream, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
            stream.write("\n")
            stream.flush()
        candidate.replace(path)
        return path.stat().st_size
    finally:
        if candidate is not None:
            candidate.unlink(missing_ok=True)



def publish_dataset(output_dir: Path, orders: object, items: object, manifest: dict) -> dict[str, int]:
    """Publish an entire immutable generation, then atomically switch one pointer.

    A failed write or process kill before current.json is replaced leaves the
    previously published generation in use. Orphan staging directories can be
    safely removed after an interrupted run. Existing legacy flat datasets are
    still readable by the frontend when no pointer exists.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    generation = uuid.uuid4().hex
    generations = output_dir / 'generations'
    generations.mkdir(parents=True, exist_ok=True)
    stage = output_dir / ('.stage-' + generation)
    stage.mkdir()
    published = generations / generation
    files = ('orders.json', 'items.json', 'metadata.json')
    payloads = (orders, items, manifest)
    try:
        sizes = {name: write_json(stage / name, payload) for name, payload in zip(files, payloads)}
        checksums = {name: digest(stage / name) for name in files}
        stage.replace(published)
        # The pointer is deliberately the last write. It is the commit record.
        write_json(output_dir / 'current.json', {
            'formatVersion': 1,
            'generation': generation,
            'sha256': checksums,
        })
        return sizes
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def aggregate_review_scores(review_rows, order_ids: set[str], invalid: Counter) -> dict[str, list[int]]:
    """Validate, deduplicate and aggregate reviews without ever exporting free text."""
    review_counts: dict[str, list[int]] = {}
    if review_rows is not None:
        seen_reviews: set[tuple[str, str]] = set()
        for order_id, review_id, score_raw in review_rows:
            if order_id not in order_ids:
                invalid["orphanReviewRows"] += 1
                continue
            if not isinstance(review_id, str) or not review_id.strip():
                invalid["invalidReviewRows"] += 1
                continue
            key = (order_id, review_id)
            if key in seen_reviews:
                invalid["duplicateReviewRows"] += 1
                continue
            score = (score_raw or "").strip()
            if score not in ("1", "2", "3", "4", "5"):
                invalid["invalidReviewRows"] += 1
                continue
            seen_reviews.add(key)
            counts = review_counts.setdefault(order_id, [0, 0, 0, 0, 0])
            counts[int(score) - 1] += 1
    return review_counts


def prepare(source: Path, output_dir: Path) -> dict:
    try:
        import duckdb
    except ImportError as exc:
        raise RuntimeError("DuckDB is required: python -m pip install -r requirements-etl.txt") from exc

    with input_paths(source) as (paths, archive_hash):
        validate_headers(paths)
        checksums = {(REVIEWS_FILENAME if name == "reviews" else INPUTS[name][0]): digest(path) for name, path in paths.items()}
        conn = duckdb.connect(database=":memory:")
        try:
            # All-varchar source prevents silent type inference altering IDs or malformed dates.
            for name, path in paths.items():
                conn.execute(f"CREATE TEMP TABLE {name} AS SELECT * FROM read_csv(?, header=true, all_varchar=true)", [str(path)])

            for table, keys in [
                ("orders", ("order_id",)), ("customers", ("customer_id",)),
                ("sellers", ("seller_id",)), ("products", ("product_id",)),
                ("translations", ("product_category_name",)),
                ("items", ("order_id", "order_item_id")),
            ]:
                ensure_unique(conn, table, keys)

            unmatched = {
                "ordersWithoutCustomer": scalar(conn, "SELECT COUNT(*) FROM orders o LEFT JOIN customers c ON o.customer_id=c.customer_id WHERE c.customer_id IS NULL"),
                "itemsWithoutOrder": scalar(conn, "SELECT COUNT(*) FROM items i LEFT JOIN orders o ON i.order_id=o.order_id WHERE o.order_id IS NULL"),
                "itemsWithoutSeller": scalar(conn, "SELECT COUNT(*) FROM items i LEFT JOIN sellers s ON i.seller_id=s.seller_id WHERE s.seller_id IS NULL"),
                "itemsWithoutProduct": scalar(conn, "SELECT COUNT(*) FROM items i LEFT JOIN products p ON i.product_id=p.product_id WHERE p.product_id IS NULL"),
            }
            # Join table cardinalities checked *before* joining; order grain remains stable.
            order_columns = {row[0] for row in conn.execute("DESCRIBE orders").fetchall()}
            approved_expr, carrier_expr = optional_order_milestone_projection(order_columns)
            approved_source_available = "order_approved_at" in order_columns
            carrier_source_available = "order_delivered_carrier_date" in order_columns
            order_rows = conn.execute(f"""
                SELECT o.order_id, o.order_status, o.order_purchase_timestamp,
                       {approved_expr} AS approved_raw,
                       {carrier_expr} AS carrier_raw,
                       o.order_delivered_customer_date, o.order_estimated_delivery_date,
                       c.customer_state, COALESCE(ic.item_count, 0) AS item_count
                FROM orders o
                LEFT JOIN customers c ON o.customer_id = c.customer_id
                LEFT JOIN (SELECT order_id, COUNT(*) AS item_count FROM items GROUP BY order_id) ic
                  ON o.order_id=ic.order_id
            """).fetchall()
            item_rows = conn.execute("""
                SELECT i.order_id, i.order_item_id, i.seller_id, s.seller_state,
                       c.customer_state, p.product_category_name,
                       t.product_category_name_english, i.price, i.freight_value
                FROM items i
                INNER JOIN orders o ON i.order_id=o.order_id
                LEFT JOIN customers c ON o.customer_id=c.customer_id
                LEFT JOIN sellers s ON i.seller_id=s.seller_id
                LEFT JOIN products p ON i.product_id=p.product_id
                LEFT JOIN translations t ON p.product_category_name=t.product_category_name
            """).fetchall()
            # Review rows are read separately, never joined into the order/item
            # export: Olist can have multiple reviews per order, and joining them
            # would inflate delivery and financial metrics.
            review_rows = conn.execute("SELECT order_id, review_id, review_score FROM reviews").fetchall() if "reviews" in paths else None
            source_orders = scalar(conn, "SELECT COUNT(*) FROM orders")
            source_items = scalar(conn, "SELECT COUNT(*) FROM items")
        finally:
            conn.close()

    if len(order_rows) != source_orders:
        raise AssertionError(f"Order join cardinality: expected {source_orders}, got {len(order_rows)}")
    if len(item_rows) != source_items - unmatched["itemsWithoutOrder"]:
        raise AssertionError("Item join cardinality changed unexpectedly")

    invalid = Counter()
    order_ids = {row[0] for row in order_rows}
    review_counts = aggregate_review_scores(review_rows, order_ids, invalid)
    orders: list[dict] = []
    for order_id, status_raw, purchase_raw, approved_raw, carrier_raw, actual_raw, estimated_raw, state_raw, item_count in order_rows:
        purchase = parse_source_timestamp(purchase_raw)
        approved = parse_source_timestamp(approved_raw)
        carrier = parse_source_timestamp(carrier_raw)
        actual = parse_source_timestamp(actual_raw)
        estimate = parse_source_calendar_date(estimated_raw)
        status = (status_raw or "").strip().lower()
        state = (state_raw or "").strip().upper() or None
        if purchase is None: invalid["invalidPurchaseTimestamps"] += 1
        if approved_raw and approved is None: invalid["invalidApprovedTimestamps"] += 1
        if carrier_raw and carrier is None: invalid["invalidCarrierHandoffTimestamps"] += 1
        if actual_raw and actual is None: invalid["invalidDeliveredTimestamps"] += 1
        if estimated_raw and estimate is None: invalid["invalidEstimatedDates"] += 1
        if status == "delivered" and actual is None: invalid["deliveredMissingActual"] += 1
        if status == "delivered" and actual is not None and purchase is not None and actual < purchase:
            invalid["negativeDeliveryDurations"] += 1
        if state is not None and state not in STATES:
            invalid["invalidCustomerStates"] += 1
            state = None
        days, day_delta, classification = classify_order(status, purchase, actual, estimate)
        order_export = {
            "orderId": order_id,
            "customerState": state,
            "purchaseDate": purchase.date().isoformat() if purchase else None,
            "purchaseTimestamp": normalized_timestamp(purchase),
            "estimatedDeliveryDate": estimate.isoformat() if estimate else None,
            "deliveredDate": actual.date().isoformat() if actual else None,
            "deliveredTimestamp": normalized_timestamp(actual),
            "status": status,
            "deliveryDays": days,
            "deliveryDayDelta": day_delta,
            "deliveryClassification": classification,
            "itemCount": int(item_count),
        }
        # Preserve the difference between a source column not being available
        # (legacy fixture) and an available column whose event value is missing.
        if approved_source_available:
            order_export["approvedTimestamp"] = normalized_timestamp(approved)
        if carrier_source_available:
            order_export["carrierHandoffTimestamp"] = normalized_timestamp(carrier)
        if review_rows is not None and order_id in review_counts:
            order_export["reviewScoreCounts"] = review_counts[order_id]
        orders.append(order_export)

    items: list[dict] = []
    for order_id, ordinal_raw, seller_id, seller_state_raw, customer_state_raw, pt, en, price_raw, freight_raw in item_rows:
        seller_state = (seller_state_raw or "").strip().upper() or None
        customer_state = (customer_state_raw or "").strip().upper() or None
        if seller_state is not None and seller_state not in STATES:
            invalid["invalidSellerStates"] += 1
            seller_state = None
        if customer_state is not None and customer_state not in STATES:
            customer_state = None
        price, freight = parse_brl(price_raw), parse_brl(freight_raw)
        if price is None: invalid["invalidItemPrice"] += 1
        if freight is None: invalid["invalidFreightCharge"] += 1
        category = category_key(pt, en)
        if category == "unknown": invalid["unknownCategoryItems"] += 1
        if category.startswith("untranslated:"): invalid["untranslatedCategoryItems"] += 1
        try:
            ordinal = int(ordinal_raw)
            if ordinal < 1: raise ValueError()
        except (TypeError, ValueError):
            raise ValueError(f"Invalid item ordinal for order {order_id}: {ordinal_raw}") from None
        items.append({
            "orderId": order_id, "orderItemId": ordinal,
            "sellerId": seller_id, "sellerState": seller_state,
            "customerState": customer_state, "category": category,
            "priceBRL": price, "freightChargeBRL": freight,
        })

    orders.sort(key=lambda order: order["orderId"])
    orders.sort(key=lambda order: order["purchaseTimestamp"] or "", reverse=True)
    items.sort(key=lambda item: (item["orderId"], item["orderItemId"]))
    if len({order["orderId"] for order in orders}) != len(orders):
        raise AssertionError("Duplicate exported order IDs")
    if len({(item["orderId"], item["orderItemId"]) for item in items}) != len(items):
        raise AssertionError("Duplicate exported item IDs")
    exported_counts = Counter(item["orderId"] for item in items)
    for order in orders:
        if order["itemCount"] != exported_counts.get(order["orderId"], 0):
            raise AssertionError(f"Item count mismatch on {order['orderId']}")

    purchase_dates = [order["purchaseDate"] for order in orders if order["purchaseDate"]]
    manifest = {
        "schemaVersion": 2,
        "sourceName": "Olist Brazilian E-Commerce",
        "sourceFiles": [filename for filename, _ in INPUTS.values()] + ([REVIEWS_FILENAME] if review_rows is not None else []),
        "processingVersion": PROCESSING_VERSION,
        "purchaseDateMin": min(purchase_dates) if purchase_dates else None,
        "purchaseDateMax": max(purchase_dates) if purchase_dates else None,
        "orderCount": len(orders), "itemCount": len(items),
        "reviewsAvailable": review_rows is not None,
        "reviewCount": sum(sum(v) for v in review_counts.values()),
        "reviewedOrderCount": len(review_counts),
        "unmatchedJoinCounts": unmatched,
        "invalidCounts": {key: int(invalid[key]) for key in (
            "invalidPurchaseTimestamps", "invalidApprovedTimestamps", "invalidCarrierHandoffTimestamps",
            "invalidDeliveredTimestamps", "invalidEstimatedDates",
            "deliveredMissingActual", "negativeDeliveryDurations", "invalidCustomerStates",
            "invalidSellerStates", "invalidItemPrice", "invalidFreightCharge",
            "unknownCategoryItems", "untranslatedCategoryItems",
            "orphanReviewRows", "invalidReviewRows", "duplicateReviewRows",
        )},
        "provenance": "https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce (CC BY-NC-SA 4.0); local noncommercial POC",
        "sampleMode": False,
        "sourceArchiveSha256": archive_hash,
        "sourceFileSha256": checksums,
    }
    sizes = publish_dataset(output_dir, orders, items, manifest)
    report = {"manifest": manifest, "exportBytes": sizes}
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Build local Olist order/item JSON with DuckDB")
    parser.add_argument("--input", type=Path, default=Path("data/raw/olist.zip"))
    parser.add_argument("--output", type=Path, default=Path("public/data"))
    args = parser.parse_args()
    started = perf_counter()
    emit_pipeline_event("data", "info", "PIPELINE_STARTED")
    try:
        report = prepare(args.input, args.output)
    except Exception:
        emit_pipeline_event("data", "error", "PIPELINE_FAILED", (perf_counter() - started) * 1000)
        raise
    emit_pipeline_event("data", "info", "PIPELINE_COMPLETED",
                        (perf_counter() - started) * 1000, report["manifest"]["orderCount"])


if __name__ == "__main__":
    main()
