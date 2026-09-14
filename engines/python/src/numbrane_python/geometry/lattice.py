"""Hex lattices, Seed/Flower of Life, Metatron complete-graph edges."""

from __future__ import annotations

import math
from collections.abc import Iterable


def hex_circle_centers(
    rings: int, radius: float, rotation_rad: float = 0.0
) -> list[tuple[float, float]]:
    """Center plus ``rings`` hex rings (6 centers per ring at distance k*radius)."""
    centers: list[tuple[float, float]] = [(0.0, 0.0)]
    for k in range(1, max(rings, 0) + 1):
        for i in range(6):
            ang = math.radians(i * 60.0) + rotation_rad
            dist = k * radius
            centers.append((dist * math.cos(ang), dist * math.sin(ang)))
    return centers


def seed_of_life_centers(radius: float, rotation_rad: float = 0.0) -> list[tuple[float, float]]:
    """Seven equal circles: center + hex ring (Seed of Life)."""
    return hex_circle_centers(1, radius, rotation_rad)


def flower_of_life_centers(radius: float, levels: int = 2) -> list[tuple[float, float]]:
    """Flower-of-Life style centers with hex expansion and dedup."""
    centers: list[tuple[float, float]] = [(0.0, 0.0)]
    angles = [math.radians(a) for a in range(0, 360, 60)]

    for angle in angles:
        centers.append((radius * math.cos(angle), radius * math.sin(angle)))

    if levels > 1:
        first_ring = list(centers[1:])
        for cx, cy in first_ring:
            for angle in angles:
                x = cx + radius * math.cos(angle)
                y = cy + radius * math.sin(angle)
                if not any(math.hypot(x - ex, y - ey) < 1e-3 for ex, ey in centers):
                    centers.append((x, y))
    return centers


def metatron_lines(
    centers: Iterable[tuple[float, float]],
) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    """Complete graph on centers (Metatron-style edges)."""
    pts = list(centers)
    edges: list[tuple[tuple[float, float], tuple[float, float]]] = []
    for i, p1 in enumerate(pts):
        for j, p2 in enumerate(pts):
            if j > i:
                edges.append((p1, p2))
    return edges


def geometry_ir_from_centers(
    centers: list[tuple[float, float]],
    radius: float,
    *,
    edges: list[tuple[tuple[float, float], tuple[float, float]]] | None = None,
) -> dict:
    """Emit NAP geometry IR in cartesian-2d."""
    primitives: list[dict] = []
    for cx, cy in centers:
        primitives.append(
            {
                "kind": "circle",
                "cx": cx,
                "cy": cy,
                "r": radius,
                "stroke": "#e8e6e3",
                "fill": None,
                "stroke_width": 0.02,
            }
        )
    if edges:
        for (x1, y1), (x2, y2) in edges:
            primitives.append(
                {
                    "kind": "line",
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2,
                    "stroke": "#a8b0b8",
                    "stroke_width": 0.01,
                }
            )
    return {
        "protocol_version": "0.1.0",
        "space": "cartesian-2d",
        "primitives": primitives,
    }
