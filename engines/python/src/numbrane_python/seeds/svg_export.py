"""SVG export for geometry IR / center+edge systems."""

from __future__ import annotations

from typing import Any

import math


def _geometry_framing(meta: dict[str, Any]) -> dict[str, float]:
    """Read composition framing hints stored on geometry IR meta."""
    return {
        "margin": float(meta.get("margin", 1.2)),
        "center_bias": float(meta.get("center_bias", 0.5)),
        "off_center_x": float(meta.get("off_center_x", 0.0)),
        "off_center_y": float(meta.get("off_center_y", 0.0)),
        "rotation": float(meta.get("rotation", 0.0)),
        "view_zoom": float(meta.get("view_zoom", 1.0)),
    }


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

    meta = dict(ir.get("meta") or {})
    frame = _geometry_framing(meta)
    max_r = max(radii) if radii else 1.0
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    pad = max_r * 1.25
    min_x, max_x = min(xs) - pad, max(xs) + pad
    min_y, max_y = min(ys) - pad, max(ys) + pad
    span_x = max(max_x - min_x, 1e-6)
    span_y = max(max_y - min_y, 1e-6)
    mid_x = (min_x + max_x) * 0.5
    mid_y = (min_y + max_y) * 0.5
    margin = frame["margin"] / max(frame["view_zoom"], 0.5)
    span_x *= margin
    span_y *= margin
    bias = max(0.0, min(1.0, frame["center_bias"]))
    span_x *= 0.85 + 0.3 * (1.0 - bias)
    span_y *= 0.85 + 0.3 * (1.0 - bias)
    min_x = mid_x - span_x * 0.5 + frame["off_center_x"] * span_x
    max_x = mid_x + span_x * 0.5 + frame["off_center_x"] * span_x
    min_y = mid_y - span_y * 0.5 + frame["off_center_y"] * span_y
    max_y = mid_y + span_y * 0.5 + frame["off_center_y"] * span_y
    span = max(max_x - min_x, max_y - min_y, 1e-6)
    rot = frame["rotation"]

    def tx(x: float, y: float) -> tuple[float, float]:
        nx = (x - min_x) / span
        ny = (y - min_y) / span
        if abs(rot) > 1e-6:
            cx, cy = 0.5, 0.5
            c, s = math.cos(rot), math.sin(rot)
            rx = (nx - cx) * c - (ny - cy) * s + cx
            ry = (nx - cx) * s + (ny - cy) * c + cy
            nx, ny = rx, ry
        px = nx * (width - 40) + 20
        py = height - (ny * (height - 40) + 20)
        return px, py

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
            opacity = p.get("opacity")
            op_attr = f' opacity="{float(opacity):.3f}"' if opacity is not None else ""
            parts.append(
                f'<line x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}" '
                f'stroke="{col}" stroke-width="{sw}" fill="none"{op_attr}/>'
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


def geometry_ir_to_png(
    ir: dict[str, Any],
    *,
    width: int = 1024,
    height: int = 1024,
    stroke: tuple[int, int, int] = (232, 238, 248),
    background: tuple[int, int, int] = (7, 8, 12),
    stroke_width: float = 1.5,
) -> "Any":
    """Rasterize geometry IR with Pillow (no Cairo dependency)."""
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (width, height), background)
    draw = ImageDraw.Draw(img)

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
        return img

    meta = dict(ir.get("meta") or {})
    frame = _geometry_framing(meta)
    max_r = max(radii) if radii else 1.0
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    pad = max_r * 1.25
    min_x, max_x = min(xs) - pad, max(xs) + pad
    min_y, max_y = min(ys) - pad, max(ys) + pad
    span_x = max(max_x - min_x, 1e-6)
    span_y = max(max_y - min_y, 1e-6)
    mid_x = (min_x + max_x) * 0.5
    mid_y = (min_y + max_y) * 0.5
    margin = frame["margin"] / max(frame["view_zoom"], 0.5)
    span_x *= margin
    span_y *= margin
    bias = max(0.0, min(1.0, frame["center_bias"]))
    span_x *= 0.85 + 0.3 * (1.0 - bias)
    span_y *= 0.85 + 0.3 * (1.0 - bias)
    min_x = mid_x - span_x * 0.5 + frame["off_center_x"] * span_x
    max_x = mid_x + span_x * 0.5 + frame["off_center_x"] * span_x
    min_y = mid_y - span_y * 0.5 + frame["off_center_y"] * span_y
    max_y = mid_y + span_y * 0.5 + frame["off_center_y"] * span_y
    span = max(max_x - min_x, max_y - min_y, 1e-6)
    rot = frame["rotation"]
    scale = (width - 40) / span

    def tx(x: float, y: float) -> tuple[float, float]:
        nx = (x - min_x) / span
        ny = (y - min_y) / span
        if abs(rot) > 1e-6:
            cx, cy = 0.5, 0.5
            c, s = math.cos(rot), math.sin(rot)
            rx = (nx - cx) * c - (ny - cy) * s + cx
            ry = (nx - cx) * s + (ny - cy) * c + cy
            nx, ny = rx, ry
        px = nx * (width - 40) + 20
        py = height - (ny * (height - 40) + 20)
        return px, py

    sw = max(1, int(stroke_width))
    for p in primitives:
        if p.get("kind") == "line":
            x1, y1 = tx(float(p["x1"]), float(p["y1"]))
            x2, y2 = tx(float(p["x2"]), float(p["y2"]))
            draw.line([(x1, y1), (x2, y2)], fill=stroke, width=sw)
        elif p.get("kind") == "circle":
            cx, cy = tx(float(p["cx"]), float(p["cy"]))
            rr = float(p["r"]) * scale
            draw.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=stroke, width=sw)

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
        draw.line([(x1, y1), (x2, y2)], fill=stroke, width=sw)

    for c, r in zip(circles, radii if radii else [1.0] * len(circles), strict=False):
        if isinstance(c, dict):
            x = float(c.get("x", c.get("cx", 0)))
            y = float(c.get("y", c.get("cy", 0)))
            rr = float(c.get("r", c.get("radius", r)))
        else:
            x, y = float(c[0]), float(c[1])
            rr = float(c[2]) if len(c) > 2 else r
        cx, cy = tx(x, y)
        rad = rr * scale
        draw.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], outline=stroke, width=sw)

    return img
