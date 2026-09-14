"""Circle-lattice reference piece — geometry IR generator."""

from __future__ import annotations

import math
from typing import Any

from numbrane_python.geometry.lattice import geometry_ir_from_centers, hex_circle_centers


def generate(recipe: dict[str, Any]) -> dict[str, Any]:
    """Generate geometry IR from a NAP recipe."""
    params = recipe.get("parameters", {})
    radius = float(params.get("geom.radius", 1.0))
    rings = int(params.get("geom.rings", 1))
    rotation_deg = float(params.get("geom.rotation_deg", 0.0))
    rotation_rad = math.radians(rotation_deg)
    _ = int(recipe.get("seed", 0))

    centers = hex_circle_centers(rings, radius, rotation_rad)
    return geometry_ir_from_centers(centers, radius)


def normalize_geometry(ir: dict[str, Any]) -> dict[str, Any]:
    """Sort primitives for stable cross-language comparison."""
    prims = list(ir.get("primitives", []))
    prims.sort(
        key=lambda p: (
            str(p.get("kind", "")),
            round(float(p.get("cx", p.get("x", p.get("x1", 0.0)))), 12),
            round(float(p.get("cy", p.get("y", p.get("y1", 0.0)))), 12),
            round(float(p.get("r", 0.0)), 12),
        )
    )
    return {
        "protocol_version": ir.get("protocol_version", "0.1.0"),
        "space": ir.get("space"),
        "primitives": prims,
    }
