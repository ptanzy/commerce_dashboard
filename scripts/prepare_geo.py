#!/usr/bin/env python3
"""Turn pinned MIT licensed 27-state Brazilian GeoJSON into TopoJSON.

No third-party dependencies. Produces valid TopoJSON with independent polygon
ring arcs (sharing identical borders is an optional later size optimization).
Defaults to pinned source; --source can use a pre-downloaded local GeoJSON.
The output is intentionally ONLY state boundaries and names, no old census data.
"""
from __future__ import annotations

from time import perf_counter
from ops_logging import emit_pipeline_event

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
    """Encode all 27 states, normalizing D3 winding and discarding collapsed rings.

    Quantizing very small valid islands can leave fewer than three unique
    vertices. This is expected loss of detail at the chosen map precision,
    **not** malformed input. Suppress those islands/holes, count them for the
    generation report, and keep at least one polygon for every state.
    An originally malformed or unclosed ring is still a hard error.
    Exterior rings are clockwise and holes counterclockwise as required by D3.
    """
    if source.get("type") != "FeatureCollection":
        raise ValueError("Expected a FeatureCollection")
    features = source.get("features")
    if not isinstance(features, list) or len(features) != 27:
        raise ValueError(f"Expected 27 GeoJSON features, got {len(features) if isinstance(features, list) else 'non-list'}")

    arcs: list[list[list[int]]] = []
    geometries: list[dict] = []
    observed: set[str] = set()
    dropped: dict[str, int] = {"collapsedPolygons": 0, "collapsedHoles": 0,
                              "rewoundExteriorRings": 0, "rewoundHoleRings": 0}

    def signed_area_twice(ring: list[tuple[int, int]]) -> int:
        """Planar signed area of quantized, closed longitude/latitude ring."""
        return sum(ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
                   for i in range(len(ring) - 1))

    def encode_ring(points: list, state: str, *, is_hole: bool = False) -> int | None:
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

        area2 = signed_area_twice(absolute)
        if area2 == 0:
            # Tiny islands may survive as three distinct quantized points but
            # become collinear, which is still not drawable geometry.
            return None
        # D3-geo uses clockwise exteriors and counterclockwise holes for
        # regions smaller than a hemisphere. A single inverted island can
        # make geoMercator.fitExtent interpret the *rest of the world* as land.
        # Normalize *after* quantization because rounding can change a tiny
        # ring's winding. Preserve its closing vertex when reversing.
        if (area2 > 0 and not is_hole) or (area2 < 0 and is_hole):
            absolute.reverse()
            dropped["rewoundHoleRings" if is_hole else "rewoundExteriorRings"] += 1

        previous = (0, 0)
        encoded: list[list[int]] = []
        for point in absolute:
            encoded.append([point[0] - previous[0], point[1] - previous[1]])
            previous = point
        arcs.append(encoded)
        return len(arcs) - 1

    def encode_polygon(polygon: list, code: str) -> list[list[int]] | None:
        if not isinstance(polygon, list) or not polygon:
            raise ValueError(f"Missing exterior polygon ring for {code}")
        exterior = encode_ring(polygon[0], code)
        if exterior is None:
            dropped["collapsedPolygons"] += 1
            return None
        # TopoJSON Polygon arcs are rings, each ring is an array of arc IDs.
        # Because each source ring is stored as one standalone arc, wrap its ID.
        encoded = [[exterior]]
        for hole in polygon[1:]:
            index = encode_ring(hole, code, is_hole=True)
            if index is None:
                dropped["collapsedHoles"] += 1
            else:
                encoded.append([index])
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



def _signed_area2(points: list[tuple[int, int]]) -> int:
    return sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(points, points[1:]))


def _simplify_segment(points: list[tuple[int, int]], tolerance_sq: int) -> list[tuple[int, int]]:
    """Nonrecursive Ramer-Douglas-Peucker in source quantized coordinates.

    Only discard intermediate vertices: endpoints and arc identities remain stable.
    No third-party dependency and no changes to filter/metric data.
    """
    if len(points) <= 2:
        return points
    keep = bytearray(len(points))
    keep[0] = keep[-1] = 1
    pending = [(0, len(points) - 1)]
    while pending:
        start, end = pending.pop()
        ax, ay = points[start]
        bx, by = points[end]
        dx, dy = bx - ax, by - ay
        length_sq = dx * dx + dy * dy
        most = -1.0
        index = -1
        for i in range(start + 1, end):
            px, py = points[i]
            if length_sq:
                u = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
                distance_sq = (px - ax - u * dx) ** 2 + (py - ay - u * dy) ** 2
            else:
                distance_sq = (px - ax) ** 2 + (py - ay) ** 2
            if distance_sq > most:
                most, index = distance_sq, i
        if most > tolerance_sq:
            keep[index] = 1
            pending.append((start, index))
            pending.append((index, end))
    return [point for point, selected in zip(points, keep) if selected]


def simplify_topology(topology: dict, tolerance_units: int = 2500) -> dict:
    """Reduce static map geometry while retaining UF identifiers and valid rings.

    2500 quantized units is 0.025 geographic degrees, approximately one-third
    of a pixel in the 524px Brazil map. Every ring keeps its original start,
    closure, winding and topology reference. Tiny/unsafe rings remain unsimplified.
    This is performed offline, *never* on a map metric or filter click.
    """
    if tolerance_units < 0 or tolerance_units > 5000:
        raise ValueError('Map simplification tolerance must be between 0 and 5000 units')
    result = {**topology, 'arcs': []}
    threshold = tolerance_units ** 2
    for encoded in topology['arcs']:
        absolute: list[tuple[int, int]] = []
        x = y = 0
        for dx, dy in encoded:
            x += dx
            y += dy
            absolute.append((x, y))
        if tolerance_units == 0 or len(absolute) < 5 or absolute[0] != absolute[-1]:
            selected = absolute
        else:
            # RDP applied to a closed ring with coincident endpoints would
            # collapse the entire ring. Split at its most distant vertex.
            anchor = max(range(1, len(absolute) - 1),
                         key=lambda i: (absolute[i][0] - absolute[0][0]) ** 2 +
                                       (absolute[i][1] - absolute[0][1]) ** 2)
            first = _simplify_segment(absolute[:anchor + 1], threshold)
            second = _simplify_segment(absolute[anchor:], threshold)
            selected = first[:-1] + second
            old_area, new_area = _signed_area2(absolute), _signed_area2(selected)
            # Preserve rings that are too small, inverted, or significantly
            # changed in area. This also keeps rare detailed island shapes.
            if (len(selected) < 4 or len(set(selected[:-1])) < 3 or
                old_area * new_area <= 0 or
                abs(new_area - old_area) > abs(old_area) * 0.005):
                selected = absolute
        previous_x = previous_y = 0
        delta: list[list[int]] = []
        for nx, ny in selected:
            delta.append([nx - previous_x, ny - previous_y])
            previous_x, previous_y = nx, ny
        result['arcs'].append(delta)
    return result

def validate_topology(topology: dict) -> dict:
    if topology.get("type") != "Topology":
        raise ValueError("Invalid topology type")
    geometries = topology.get("objects",{}).get("estados",{}).get("geometries",[])
    codes = [feature.get("id") for feature in geometries]
    if len(codes) != 27 or set(codes) != STATES:
        raise ValueError("Topological state coverage is not exactly 27 UFs")
    arcs = topology["arcs"]
    counter = Counter()
    for state in geometries:
        shape_type = state["type"]
        if shape_type == "Polygon":
            polygons = [state["arcs"]]
        elif shape_type == "MultiPolygon":
            polygons = state["arcs"]
        else:
            raise ValueError(f"Unsupported topology geometry: {shape_type}")
        for polygon in polygons:
            if not isinstance(polygon, list) or not polygon:
                raise ValueError("Invalid TopoJSON polygon rings")
            for ring_index, ring in enumerate(polygon):
                if not isinstance(ring, list) or not ring:
                    raise ValueError("TopoJSON ring must be a nonempty array of arc indices")
                for index in ring:
                    if not isinstance(index,int) or index < 0 or index >= len(arcs):
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
                    # Prevent a reversed tiny polygon from turning the Brazil
                    # map into an almost solid rectangle in d3-geo.
                    ring_points = []
                    x = y = 0
                    for dx, dy in arcs[index]:
                        x += dx
                        y += dy
                        ring_points.append((x, y))
                    signed_area = sum(
                        ring_points[i][0] * ring_points[i + 1][1] -
                        ring_points[i + 1][0] * ring_points[i][1]
                        for i in range(len(ring_points) - 1)
                    )
                    if (ring_index == 0 and signed_area >= 0) or (ring_index > 0 and signed_area <= 0):
                        raise ValueError("Invalid polygon ring winding: D3 requires clockwise exteriors and counterclockwise holes")
    if set(counter) != set(range(len(arcs))):
        raise ValueError("Unreferenced arc in topology")
    return {"states":len(geometries),"arcs":len(arcs),"bytes":len(json.dumps(topology,separators=(',',':')))}


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate and validate a 27-state TopoJSON asset from pinned MIT GeoJSON")
    parser.add_argument("--source", type=Path, help="Local composite GeoJSON file (no network required)")
    parser.add_argument("--output", type=Path, default=Path("public/geo/brazil-states.topojson"))
    args = parser.parse_args()
    started = perf_counter()
    emit_pipeline_event("geography", "info", "PIPELINE_STARTED")
    try:
        if args.source:
            data = args.source.read_bytes()
        else:
            with urlopen(SOURCE_URL, timeout=45) as response:
                data = response.read()
        source_sha = hashlib.sha256(data).hexdigest()
        diagnostics: dict[str, int] = {}
        original = convert_geojson(json.loads(data), diagnostics=diagnostics)
        result = simplify_topology(original)
        summary = validate_topology(result)
        diagnostics["originalPoints"] = sum(len(arc) for arc in original["arcs"])
        diagnostics["renderPoints"] = sum(len(arc) for arc in result["arcs"])
        args.output.parent.mkdir(parents=True,exist_ok=True)
        blob = (json.dumps(result,ensure_ascii=False,separators=(',',':'))+"\n").encode("utf-8")
        args.output.write_bytes(blob)
        print(json.dumps({"sourceURL":SOURCE_URL,"sourceSha256":source_sha,"output":str(args.output),"outputSha256":hashlib.sha256(blob).hexdigest(),**summary,**diagnostics},indent=2))
    except Exception:
        emit_pipeline_event("geography", "error", "PIPELINE_FAILED", (perf_counter() - started) * 1000)
        raise
    emit_pipeline_event("geography", "info", "PIPELINE_COMPLETED",
                        (perf_counter() - started) * 1000, summary["states"])


if __name__ == '__main__':
    main()
