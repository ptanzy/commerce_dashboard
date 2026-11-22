#!/usr/bin/env python3
"""Turn pinned MIT licensed 27-state Brazilian GeoJSON into TopoJSON.

No third-party dependencies. Produces valid TopoJSON with independent polygon
ring arcs (sharing identical borders is an optional later size optimization).
Defaults to pinned source; --source can use a pre-downloaded local GeoJSON.
The output is intentionally ONLY state boundaries and names, no old census data.
"""
from __future__ import annotations

import argparse
from collections import Counter
import math
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

PINNED_COMMIT = "32d7169859c5dad3bd7ae4f2710733b96b02d40f"
SOURCE_URL = f"https://raw.githubusercontent.com/giuliano-macedo/geodata-br-states/{PINNED_COMMIT}/geojson/br_states.json"
STATES = set("AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split())
SCALE = [0.00001, 0.00001]
TRANSLATE = [-180.0, -90.0]


def convert_geojson(source: dict, *, diagnostics: dict | None = None) -> dict:
    """Encode all 27 states, discarding only sub-grid-size rings.

    Quantizing very small valid islands can leave fewer than three unique
    vertices. This is expected loss of detail at the chosen map precision,
    **not** malformed input. Suppress those islands/holes, count them for the
    generation report, and keep at least one polygon for every state.
    An originally malformed or unclosed ring is still a hard error.
    """
    if source.get("type") != "FeatureCollection":
        raise ValueError("Expected a FeatureCollection")
    features = source.get("features")
    if not isinstance(features, list) or len(features) != 27:
        raise ValueError(f"Expected 27 GeoJSON features, got {len(features) if isinstance(features, list) else 'non-list'}")

    arcs: list[list[list[int]]] = []
    geometries: list[dict] = []
    observed: set[str] = set()
    dropped: dict[str, int] = {"collapsedPolygons": 0, "collapsedHoles": 0}

    def encode_ring(points: list, state: str) -> int | None:
        if not isinstance(points, list) or len(points) < 4:
            raise ValueError(f"Malformed polygon ring in {state}: fewer than four positions")
        raw: list[tuple[float, float]] = []
        for point in points:
            if not isinstance(point, (tuple, list)) or len(point) < 2:
                raise ValueError(f"Invalid coordinate pair in {state}")
            x, y = float(point[0]), float(point[1])
            if not math.isfinite(x) or not math.isfinite(y) or not (-180 <= x <= 180 and -90 <= y <= 90):
                raise ValueError(f"Geographic coordinate out of bounds in {state}: {point}")
            raw.append((x, y))
        if raw[0] != raw[-1] or len(set(raw)) < 3:
            raise ValueError(f"Malformed source ring in {state}: unclosed or degenerate before quantization")

        absolute: list[tuple[int, int]] = []
        for x, y in raw:
            quantized = (round((x - TRANSLATE[0]) / SCALE[0]),
                         round((y - TRANSLATE[1]) / SCALE[1]))
            if not absolute or absolute[-1] != quantized:
                absolute.append(quantized)

        # Source ring was valid, but rounding can erase extremely small
        # coastal/island fragments. An individual collapsed ring has no
        # drawable area at our precision; do not abort the entire state map.
        if len(absolute) < 4 or len(set(absolute)) < 3:
            return None
        if absolute[0] != absolute[-1]:
            raise ValueError(f"Unexpected quantization closure failure in {state}")

        previous = (0, 0)
        encoded: list[list[int]] = []
        for point in absolute:
            encoded.append([point[0] - previous[0], point[1] - previous[1]])
            previous = point
        arcs.append(encoded)
        return len(arcs) - 1

    def encode_polygon(polygon: list, code: str) -> list[int] | None:
        if not isinstance(polygon, list) or not polygon:
            raise ValueError(f"Missing exterior polygon ring for {code}")
        exterior = encode_ring(polygon[0], code)
        if exterior is None:
            dropped["collapsedPolygons"] += 1
            return None
        encoded = [exterior]
        for hole in polygon[1:]:
            index = encode_ring(hole, code)
            if index is None:
                dropped["collapsedHoles"] += 1
            else:
                encoded.append(index)
        return encoded

    for feature in features:
        props = feature.get("properties") or {}
        code = props.get("SIGLA") or feature.get("id")
        if code not in STATES or code in observed:
            raise ValueError(f"Missing, unexpected or duplicate state UF: {code!r}")
        if feature.get("id") and feature.get("id") != code:
            raise ValueError(f"Feature ID disagrees with SIGLA for {code}")
        observed.add(code)
        geom = feature.get("geometry") or {}
        shape_type = geom.get("type")
        coords = geom.get("coordinates")
        if shape_type == "Polygon":
            index = encode_polygon(coords, code)
            if index is None:
                raise ValueError(f"State {code} exterior polygon vanished under quantization")
        elif shape_type == "MultiPolygon":
            if not isinstance(coords, list) or not coords:
                raise ValueError(f"Empty MultiPolygon in {code}")
            index = []
            for polygon in coords:
                encoded = encode_polygon(polygon, code)
                if encoded is not None:
                    index.append(encoded)
            if not index:
                raise ValueError(f"Every polygon in state {code} vanished under quantization")
        else:
            raise ValueError(f"Unsupported state geometry for {code}: {shape_type}")
        geometries.append({"type": shape_type, "id": code,
                           "properties": {"SIGLA": code, "Estado": props.get("Estado") or code},
                           "arcs": index})

    if observed != STATES:
        raise ValueError(f"State coverage mismatch: missing={sorted(STATES - observed)}")
    geometries.sort(key=lambda state: state["id"])
    if diagnostics is not None:
        diagnostics.update(dropped)
    return {"type": "Topology", "transform": {"scale": SCALE, "translate": TRANSLATE},
            "objects": {"estados": {"type": "GeometryCollection", "geometries": geometries}},
            "arcs": arcs}


def validate_topology(topology: dict) -> dict:
    if topology.get("type") != "Topology":
        raise ValueError("Invalid topology type")
    geometries = topology.get("objects",{}).get("estados",{}).get("geometries",[])
    codes = [feature.get("id") for feature in geometries]
    if len(codes) != 27 or set(codes) != STATES:
        raise ValueError("Topological state coverage is not exactly 27 UFs")
    arcs = topology["arcs"]
    counter = Counter()
    for feature in geometries:
        rings = feature["arcs"] if feature["type"] == "Polygon" else [ring for polygon in feature["arcs"] for ring in polygon]
        for index in rings:
            if index < 0 or index >= len(arcs):
                raise ValueError(f"Invalid arc reference {index}")
            counter[index] += 1
            if len(arcs[index]) < 4:
                raise ValueError("Arc is too short")
            absolute = [0, 0]
            first = None
            for dx,dy in arcs[index]:
                absolute[0] += dx
                absolute[1] += dy
                if first is None: first = tuple(absolute)
            if tuple(absolute) != first:
                raise ValueError("Arc is not a closed ring")
    if set(counter) != set(range(len(arcs))):
        raise ValueError("Unreferenced arc in topology")
    return {"states":len(geometries),"arcs":len(arcs),"bytes":len(json.dumps(topology,separators=(',',':')))}


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate and validate a 27-state TopoJSON asset from pinned MIT GeoJSON")
    parser.add_argument("--source", type=Path, help="Local composite GeoJSON file (no network required)")
    parser.add_argument("--output", type=Path, default=Path("public/geo/brazil-states.topojson"))
    args = parser.parse_args()
    if args.source:
        data = args.source.read_bytes()
    else:
        with urlopen(SOURCE_URL, timeout=45) as response:
            data = response.read()
    source_sha = hashlib.sha256(data).hexdigest()
    diagnostics: dict[str, int] = {}
    result = convert_geojson(json.loads(data), diagnostics=diagnostics)
    summary = validate_topology(result)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    blob = (json.dumps(result,ensure_ascii=False,separators=(',',':'))+"\n").encode("utf-8")
    args.output.write_bytes(blob)
    print(json.dumps({"sourceURL":SOURCE_URL,"sourceSha256":source_sha,"output":str(args.output),"outputSha256":hashlib.sha256(blob).hexdigest(),**summary,**diagnostics},indent=2))


if __name__ == '__main__':
    main()
