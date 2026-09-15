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
    seed: int = 42,
    composition_mode: str = "canonical",
    for_animation: bool = False,
    construction_progress: float | None = None,
) -> dict[str, Any]:
    """Build sacred geometry IR. Seed applies bounded rotation / layer / scale variation."""
    from numbrane_python.composition.grammar import (
        apply_geometry_composition,
        reveal_construction_progress,
    )

    rot = ((seed & 0xFFFFFFFF) % 360) * (math.pi / 180.0) * 0.12
    layer_nudge = (seed % 3) - 1
    scale_nudge = 0.92 + ((seed % 17) / 17.0) * 0.16

    def _rotate_xy(x: float, y: float) -> tuple[float, float]:
        c, s = math.cos(rot), math.sin(rot)
        return (x * c - y * s, x * s + y * c)

    anim = for_animation and composition_mode == "construction"

    if kind in {"flower-of-life", "geometry/flower-of-life"}:
        lyr = max(1, layers + layer_nudge)
        centers = [_rotate_xy(x, y) for x, y in flower_of_life_layers(radius * scale_nudge, lyr)]
        ir = geometry_ir_from_centers(centers, radius)
        ir["meta"] = {"kind": "flower-of-life", "layers": lyr, "seed": seed, "rotation": rot}
        ir = apply_geometry_composition(ir, composition_mode, seed=seed, for_animation=anim)
    elif kind in {"sri-yantra", "geometry/sri-yantra"}:
        tri = sri_yantra_triangles(scale * scale_nudge)
        primitives: list[dict[str, Any]] = []
        for poly in tri["up"] + tri["down"]:
            for i in range(len(poly) - 1):
                x1, y1 = _rotate_xy(*poly[i])
                x2, y2 = _rotate_xy(*poly[i + 1])
                primitives.append({"kind": "line", "x1": x1, "y1": y1, "x2": x2, "y2": y2})
        primitives.append({"kind": "circle", "cx": 0.0, "cy": 0.0, "r": scale * scale_nudge})
        ir = {
            "protocol_version": "0.1.0",
            "kind": "sri-yantra",
            "primitives": primitives,
            "meta": {**tri, "seed": seed, "rotation": rot},
        }
        ir = apply_geometry_composition(ir, composition_mode, seed=seed, for_animation=anim)
    elif kind in {"isometric", "geometry/isometric"}:
        n = 6 + (seed % 3)
        centers = [_rotate_xy(x, y) for x, y in isometric_nodes(cols=n, rows=n)]
        ir = geometry_ir_from_centers(centers, radius * 0.35)
        ir["meta"] = {"kind": "isometric", "seed": seed, "n": n}
        ir = apply_geometry_composition(ir, composition_mode, seed=seed, for_animation=anim)
    else:
        raise ValueError(f"unknown sacred geometry kind: {kind}")

    if anim and construction_progress is not None:
        return reveal_construction_progress(ir, float(construction_progress))
    return ir


def sacred_to_preview_svg(ir: dict[str, Any], width: int = 1024, height: int = 1024) -> str:
    from numbrane_python.seeds.svg_export import geometry_ir_to_svg

    return geometry_ir_to_svg(ir, width=width, height=height)
