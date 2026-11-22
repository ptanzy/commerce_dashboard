#!/usr/bin/env python3
"""WU-01: reproducible local-only Olist → compact JSON using DuckDB.

Usage: python scripts/prepare_data.py --input data/raw/olist.zip --output public/data
Run from repo root. Requirements: Python 3.12+; pip install -r requirements-etl.txt.
Only the SIX required business CSVs are extracted or read. No geolocation processing.
"""
from __future__ import annotations

import argparse
from collections import Counter
from contextlib import contextmanager
import csv
from datetime import date
import hashlib
import json
import math
from pathlib import Path
import tempfile
from typing import Iterator
from zipfile import ZipFile

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
PROCESSING_VERSION = "wu01-duckdb-1"
STATES = set("AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split())


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
        for name, path in paths.items():
            if not path.is_file():
                raise ValueError(f"Missing required {name} CSV at {path}")
        yield paths, None
        return
    if not source.is_file() or not source.suffix.lower() == ".zip":
        raise ValueError(f"Supply a ZIP archive or extracted CSV directory: {source}")
    with tempfile.TemporaryDirectory(prefix="olist-six-") as tmp, ZipFile(source) as archive:
        paths: dict[str, Path] = {}
        # Do not extract arbitrary archive paths; resolve by basename, reject ambiguity.
        for name, (filename, _) in INPUTS.items():
            matches = [entry for entry in archive.infolist() if not entry.is_dir() and Path(entry.filename).name == filename]
            if len(matches) != 1:
                raise ValueError(f"Expected exactly one {filename} in archive; found {len(matches)}")
            target = Path(tmp) / filename
            with archive.open(matches[0]) as inp, target.open("wb") as out:
                import shutil
                shutil.copyfileobj(inp, out)
            paths[name] = target
        yield paths, digest(source)


def validate_headers(paths: dict[str, Path]) -> None:
    for name, path in paths.items():
        with path.open("r", encoding="utf-8-sig", newline="") as source:
            columns = set(next(csv.reader(source), []))
        missing = INPUTS[name][1] - columns
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
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, prefix=path.name + ".", suffix=".tmp", delete=False) as f:
        candidate = Path(f.name)
        try:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
            f.write("\n")
        except BaseException:
            candidate.unlink(missing_ok=True)
            raise
    candidate.replace(path)
    return path.stat().st_size


def prepare(source: Path, output_dir: Path) -> dict:
    try:
        import duckdb
    except ImportError as exc:
        raise RuntimeError("DuckDB is required: python -m pip install -r requirements-etl.txt") from exc

    with input_paths(source) as (paths, archive_hash):
        validate_headers(paths)
        checksums = {INPUTS[name][0]: digest(path) for name, path in paths.items()}
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
            order_rows = conn.execute("""
                SELECT o.order_id, o.order_status, o.order_purchase_timestamp,
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
            source_orders = scalar(conn, "SELECT COUNT(*) FROM orders")
            source_items = scalar(conn, "SELECT COUNT(*) FROM items")
        finally:
            conn.close()

    if len(order_rows) != source_orders:
        raise AssertionError(f"Order join cardinality: expected {source_orders}, got {len(order_rows)}")
    if len(item_rows) != source_items - unmatched["itemsWithoutOrder"]:
        raise AssertionError("Item join cardinality changed unexpectedly")

    invalid = Counter()
    orders: list[dict] = []
    for order_id, status_raw, purchase_raw, actual_raw, estimated_raw, state_raw, item_count in order_rows:
        purchase = parse_source_timestamp(purchase_raw)
        actual = parse_source_timestamp(actual_raw)
        estimate = parse_source_calendar_date(estimated_raw)
        status = (status_raw or "").strip().lower()
        state = (state_raw or "").strip().upper() or None
        if purchase is None: invalid["invalidPurchaseTimestamps"] += 1
        if actual_raw and actual is None: invalid["invalidDeliveredTimestamps"] += 1
        if estimated_raw and estimate is None: invalid["invalidEstimatedDates"] += 1
        if status == "delivered" and actual is None: invalid["deliveredMissingActual"] += 1
        if status == "delivered" and actual is not None and purchase is not None and actual < purchase:
            invalid["negativeDeliveryDurations"] += 1
        if state is not None and state not in STATES:
            invalid["invalidCustomerStates"] += 1
            state = None
        days, day_delta, classification = classify_order(status, purchase, actual, estimate)
        orders.append({
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
        })

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
        "sourceFiles": [filename for filename, _ in INPUTS.values()],
        "processingVersion": PROCESSING_VERSION,
        "purchaseDateMin": min(purchase_dates) if purchase_dates else None,
        "purchaseDateMax": max(purchase_dates) if purchase_dates else None,
        "orderCount": len(orders), "itemCount": len(items),
        "unmatchedJoinCounts": unmatched,
        "invalidCounts": {key: int(invalid[key]) for key in (
            "invalidPurchaseTimestamps", "invalidDeliveredTimestamps", "invalidEstimatedDates",
            "deliveredMissingActual", "negativeDeliveryDurations", "invalidCustomerStates",
            "invalidSellerStates", "invalidItemPrice", "invalidFreightCharge",
            "unknownCategoryItems", "untranslatedCategoryItems",
        )},
        "provenance": "https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce (CC BY-NC-SA 4.0); local noncommercial POC",
        "sampleMode": False,
        "sourceArchiveSha256": archive_hash,
        "sourceFileSha256": checksums,
    }
    sizes = {
        "orders.json": write_json(output_dir / "orders.json", orders),
        "items.json": write_json(output_dir / "items.json", items),
        "metadata.json": write_json(output_dir / "metadata.json", manifest),
    }
    report = {"manifest": manifest, "exportBytes": sizes}
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Build local Olist order/item JSON with DuckDB")
    parser.add_argument("--input", type=Path, default=Path("data/raw/olist.zip"))
    parser.add_argument("--output", type=Path, default=Path("public/data"))
    args = parser.parse_args()
    prepare(args.input, args.output)


if __name__ == "__main__":
    main()
