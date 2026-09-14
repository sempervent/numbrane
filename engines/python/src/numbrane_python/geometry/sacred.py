"""Sacred geometry: Sri Yantra, multi-layer Flower of Life, isometric lattice."""

from __future__ import annotations

import math
from typing import Any

from numbrane_python.geometry.lattice import geometry_ir_from_centers


def flower_of_life_layers(radius: float = 1.0, layers: int = 3) -> list[tuple[float, float]]:
    """Multi-layer Flower of Life centers (hex packing rings)."""
    centers: list[tuple[float, float]] = [(0.0, 0.0)]
    for ring in range(1, max(1, layers) + 1):
        for i in range(6 * ring):
            a = (i / (6 * ring)) * math.tau
            centers.append((math.cos(a) * radius * ring, math.sin(a) * radius * ring))
    # dedupe
    uniq: dict[tuple[int, int], tuple[float, float]] = {}
    for x, y in centers:
        uniq[(round(x * 1e6), round(y * 1e6))] = (x, y)
    return list(uniq.values())


def sri_yantra_triangles(scale: float = 1.0) -> dict[str, Any]:
    """Interlocked upward/downward triangles approximating Sri Yantra structure."""
    # Nine interlocking triangles as line segments in IR-friendly form
    up = []
    down = []
    for i, s in enumerate([1.0, 0.78, 0.58, 0.42]):
        h = s * scale * (1.0 if i % 2 == 0 else 0.92)
        up.append(
            [
                (0.0, h),
                (-h * 0.866, -h * 0.5),
                (h * 0.866, -h * 0.5),
                (0.0, h),
            ]
        )
    for i, s in enumerate([0.92, 0.7, 0.52, 0.36, 0.22]):
        h = s * scale
        down.append(
            [
                (0.0, -h),
                (-h * 0.866, h * 0.5),
                (h * 0.866, h * 0.5),
                (0.0, -h),
            ]
        )
    return {"up": up, "down": down, "scale": scale}


def isometric_nodes(
    cols: int = 7,
    rows: int = 7,
    size: float = 0.22,
) -> list[tuple[float, float]]:
    """Isometric grid nodes in normalized coordinates."""
    nodes: list[tuple[float, float]] = []
    for r in range(rows):
        for c in range(cols):
            x = (c - cols / 2) * size + (r % 2) * size * 0.5
            y = (r - rows / 2) * size * 0.866
            nodes.append((x, y))
    return nodes


def build_sacred_geometry_ir(
    kind: str,
    *,
    radius: float = 1.0,
    layers: int = 3,
    scale: float = 1.0,
) -> dict[str, Any]:
    if kind in {"flower-of-life", "geometry/flower-of-life"}:
        centers = flower_of_life_layers(radius, layers)
        ir = geometry_ir_from_centers(centers, radius)
        ir["meta"] = {"kind": "flower-of-life", "layers": layers}
        return ir
    if kind in {"sri-yantra", "geometry/sri-yantra"}:
        tri = sri_yantra_triangles(scale)
        primitives: list[dict[str, Any]] = []
        for poly in tri["up"] + tri["down"]:
            for i in range(len(poly) - 1):
                x1, y1 = poly[i]
                x2, y2 = poly[i + 1]
                primitives.append({"kind": "line", "x1": x1, "y1": y1, "x2": x2, "y2": y2})
        primitives.append({"kind": "circle", "cx": 0.0, "cy": 0.0, "r": scale})
        return {
            "protocol_version": "0.1.0",
            "kind": "sri-yantra",
            "primitives": primitives,
            "meta": tri,
        }
    if kind in {"isometric", "geometry/isometric"}:
        centers = isometric_nodes()
        ir = geometry_ir_from_centers(centers, radius * 0.35)
        ir["meta"] = {"kind": "isometric"}
        return ir
    raise ValueError(f"unknown sacred geometry kind: {kind}")


def sacred_to_preview_svg(ir: dict[str, Any], width: int = 1024, height: int = 1024) -> str:
    from numbrane_python.seeds.svg_export import geometry_ir_to_svg

    return geometry_ir_to_svg(ir, width=width, height=height)
