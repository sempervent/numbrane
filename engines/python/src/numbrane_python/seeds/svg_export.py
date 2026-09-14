"""SVG export for geometry IR / center+edge systems."""

from __future__ import annotations

from typing import Any


def geometry_ir_to_svg(
    ir: dict[str, Any],
    *,
    width: int = 1024,
    height: int = 1024,
    stroke: str = "#e8eef8",
    fill: str = "none",
    stroke_width: float = 1.5,
    background: str = "#07080c",
) -> str:
    """Convert NUMBRANE geometry-IR to SVG (primitives or circles/edges)."""
    primitives = list(ir.get("primitives") or [])
    circles = list(ir.get("circles") or [])
    edges = list(ir.get("edges") or [])

    pts: list[tuple[float, float]] = []
    radii: list[float] = []

    for p in primitives:
        kind = p.get("kind")
        if kind == "circle":
            pts.append((float(p["cx"]), float(p["cy"])))
            radii.append(float(p["r"]))
        elif kind == "line":
            pts.append((float(p["x1"]), float(p["y1"])))
            pts.append((float(p["x2"]), float(p["y2"])))

    for c in circles:
        if isinstance(c, dict):
            x, y = float(c.get("x", c.get("cx", 0))), float(c.get("y", c.get("cy", 0)))
            r = float(c.get("r", c.get("radius", 1)))
        else:
            x, y, r = float(c[0]), float(c[1]), float(c[2]) if len(c) > 2 else 1.0
        pts.append((x, y))
        radii.append(r)

    for e in edges:
        if isinstance(e, dict):
            a, b = e.get("a") or e.get("p0"), e.get("b") or e.get("p1")
            if a and b:
                pts.append((float(a[0]), float(a[1])))
                pts.append((float(b[0]), float(b[1])))
        elif isinstance(e, (list, tuple)) and len(e) == 2:
            p0, p1 = e
            pts.append((float(p0[0]), float(p0[1])))
            pts.append((float(p1[0]), float(p1[1])))

    if not pts:
        pts = [(0.0, 0.0)]
        radii = [1.0]

    max_r = max(radii) if radii else 1.0
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    pad = max_r * 1.25
    min_x, max_x = min(xs) - pad, max(xs) + pad
    min_y, max_y = min(ys) - pad, max(ys) + pad
    span = max(max_x - min_x, max_y - min_y, 1e-6)

    def tx(x: float, y: float) -> tuple[float, float]:
        nx = (x - min_x) / span * (width - 40) + 20
        ny = height - ((y - min_y) / span * (height - 40) + 20)
        return nx, ny

    scale = (width - 40) / span
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">',
        f'<rect width="100%" height="100%" fill="{background}"/>',
    ]

    for p in primitives:
        if p.get("kind") == "line":
            x1, y1 = tx(float(p["x1"]), float(p["y1"]))
            x2, y2 = tx(float(p["x2"]), float(p["y2"]))
            sw = stroke_width
            col = p.get("stroke") or stroke
            parts.append(
                f'<line x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}" '
                f'stroke="{col}" stroke-width="{sw}" fill="none"/>'
            )
        elif p.get("kind") == "circle":
            cx, cy = tx(float(p["cx"]), float(p["cy"]))
            rr = float(p["r"]) * scale
            col = p.get("stroke") or stroke
            parts.append(
                f'<circle cx="{cx:.3f}" cy="{cy:.3f}" r="{rr:.3f}" '
                f'fill="{fill}" stroke="{col}" stroke-width="{stroke_width}"/>'
            )

    for e in edges:
        if isinstance(e, dict):
            a, b = e.get("a") or e.get("p0"), e.get("b") or e.get("p1")
            if not a or not b:
                continue
            x1, y1 = tx(float(a[0]), float(a[1]))
            x2, y2 = tx(float(b[0]), float(b[1]))
        else:
            p0, p1 = e
            x1, y1 = tx(float(p0[0]), float(p0[1]))
            x2, y2 = tx(float(p1[0]), float(p1[1]))
        parts.append(
            f'<line x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}" '
            f'stroke="{stroke}" stroke-width="{stroke_width}" fill="none"/>'
        )

    for c, r in zip(circles, radii if radii else [1.0] * len(circles), strict=False):
        if isinstance(c, dict):
            x = float(c.get("x", c.get("cx", 0)))
            y = float(c.get("y", c.get("cy", 0)))
            rr = float(c.get("r", c.get("radius", r)))
        else:
            x, y = float(c[0]), float(c[1])
            rr = float(c[2]) if len(c) > 2 else r
        cx, cy = tx(x, y)
        parts.append(
            f'<circle cx="{cx:.3f}" cy="{cy:.3f}" r="{rr * scale:.3f}" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}"/>'
        )

    parts.append("</svg>")
    return "\n".join(parts)
