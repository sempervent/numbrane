"""Reusable composition grammar helpers (framing, masks, bias) — not piece math."""

from __future__ import annotations

import math
from typing import Any

import numpy as np


def background_rgb(
    name: str, palette_bg: tuple[int, int, int] | None = None
) -> tuple[int, int, int]:
    """Intentional backgrounds — avoid noisy defaults."""
    table = {
        "pure-black": (0, 0, 0),
        "near-black": (6, 7, 10),
        "warm-paper": (236, 228, 214),
        "cool-paper": (220, 226, 232),
        "single-dark-hue": (12, 14, 22),
        "transparent": (0, 0, 0),
    }
    if name in table:
        return table[name]
    if palette_bg is not None:
        return palette_bg
    return (0, 0, 0)


def framing_transform(
    xs: np.ndarray,
    ys: np.ndarray,
    *,
    width: int,
    height: int,
    framing: str = "fit",
    margin: float = 1.2,
    center_bias: float = 0.5,
    off_center_x: float = 0.0,
    off_center_y: float = 0.0,
    rotation: float = 0.0,
    view_span: float = 40.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Map world samples into pixel coordinates with composition controls."""
    if len(xs) == 0:
        return xs, ys
    min_x, max_x = float(xs.min()), float(xs.max())
    min_y, max_y = float(ys.min()), float(ys.max())
    span_x = max(max_x - min_x, 1e-6)
    span_y = max(max_y - min_y, 1e-6)

    if framing == "fixed":
        cx = (min_x + max_x) * 0.5
        cy = (min_y + max_y) * 0.5
        half = view_span * 0.5
        min_x, max_x = cx - half, cx + half
        min_y, max_y = cy - half, cy + half
        span_x = span_y = view_span
    elif framing == "center":
        # Keep aspect, center content
        pass

    # Margin expands world bounds → more negative space
    mid_x = (min_x + max_x) * 0.5
    mid_y = (min_y + max_y) * 0.5
    span_x *= margin
    span_y *= margin
    # Center bias: 1 = tightly centered crop, 0 = use full extent
    bias = float(np.clip(center_bias, 0.0, 1.0))
    span_x = span_x * (0.85 + 0.3 * (1.0 - bias))
    span_y = span_y * (0.85 + 0.3 * (1.0 - bias))
    min_x = mid_x - span_x * 0.5 + off_center_x * span_x
    max_x = mid_x + span_x * 0.5 + off_center_x * span_x
    min_y = mid_y - span_y * 0.5 + off_center_y * span_y
    max_y = mid_y + span_y * 0.5 + off_center_y * span_y

    nx = (xs - min_x) / max(max_x - min_x, 1e-6)
    ny = (ys - min_y) / max(max_y - min_y, 1e-6)

    if abs(rotation) > 1e-6:
        cx, cy = 0.5, 0.5
        c, s = math.cos(rotation), math.sin(rotation)
        rx = (nx - cx) * c - (ny - cy) * s + cx
        ry = (nx - cx) * s + (ny - cy) * c + cy
        nx, ny = rx, ry

    px = nx * (width - 1)
    py = (1.0 - ny) * (height - 1)
    return px, py


def composition_mask(
    width: int,
    height: int,
    kind: str = "none",
    *,
    seed: int = 42,
    strength: float = 1.0,
) -> np.ndarray | None:
    """Return HxW float mask in [0,1] or None for full field."""
    if kind in {"", "none", "full"}:
        return None
    yy, xx = np.mgrid[0:height, 0:width]
    cx = (width - 1) * 0.5
    cy = (height - 1) * 0.5
    nx = (xx - cx) / max(cx, 1)
    ny = (yy - cy) / max(cy, 1)
    r = np.sqrt(nx * nx + ny * ny)
    rng = np.random.default_rng(seed & 0xFFFFFFFF)

    if kind == "circle":
        mask = (r < 0.85).astype(np.float32)
    elif kind == "ring":
        mask = ((r > 0.35) & (r < 0.9)).astype(np.float32)
    elif kind == "bands":
        mask = (np.sin(ny * 6.0 + seed * 0.01) > 0).astype(np.float32)
    elif kind == "central-void":
        mask = (r > 0.28).astype(np.float32)
    elif kind == "off-center-void":
        ox = 0.25 + (seed % 7) * 0.04
        oy = -0.15 + (seed % 5) * 0.03
        r2 = np.sqrt((nx - ox) ** 2 + (ny - oy) ** 2)
        mask = (r2 > 0.22).astype(np.float32)
    elif kind == "field-threshold":
        noise = rng.random((height, width))
        mask = (noise > 0.35).astype(np.float32)
    else:
        return None
    if strength < 1.0:
        mask = mask * float(strength) + (1.0 - float(strength))
    return mask.astype(np.float32)


def parse_composition(params: dict[str, Any]) -> dict[str, Any]:
    """Normalize composition keys from Studio / recipe parameters."""
    return {
        "framing": str(params.get("framing", params.get("comp.framing", "fit"))),
        "margin": float(params.get("margin", params.get("comp.margin", 1.2))),
        "center_bias": float(params.get("center_bias", params.get("comp.center_bias", 0.5))),
        "off_center_x": float(params.get("off_center_x", params.get("comp.off_center_x", 0.0))),
        "off_center_y": float(params.get("off_center_y", params.get("comp.off_center_y", 0.0))),
        "rotation": float(params.get("comp.rotation", params.get("rotation", 0.0))),
        "mask": str(params.get("comp.mask", params.get("mask", "none"))),
        "background": str(params.get("background", params.get("comp.background", "near-black"))),
        "density": float(params.get("density", 1.0)),
        "view_span": float(params.get("view_span", 40.0)),
        "composition_mode": str(
            params.get("composition_mode", params.get("comp.mode", "canonical"))
        ),
    }


def apply_geometry_composition(
    ir: dict[str, Any],
    mode: str,
    *,
    seed: int = 42,
) -> dict[str, Any]:
    """Adjust sacred-geometry IR for composition modes — does not change lattice math."""
    if mode in {"", "canonical", "none"}:
        return ir
    out = dict(ir)
    meta = dict(out.get("meta") or {})
    meta["composition_mode"] = mode
    rng = np.random.default_rng(seed & 0xFFFFFFFF)
    primitives = list(out.get("primitives") or [])
    edges = list(out.get("edges") or [])

    if mode == "construction":
        meta["construction"] = True
        out["primitives"] = [p for p in primitives if p.get("kind") == "circle"]
        out["edges"] = []
    elif mode == "cropped":
        meta["margin"] = 0.88
        meta["center_bias"] = 0.85
    elif mode == "detail":
        meta["margin"] = 0.72
        meta["center_bias"] = 0.92
        meta["view_zoom"] = 1.35
    elif mode == "off-axis":
        meta["off_center_x"] = 0.12 + (seed % 5) * 0.04
        meta["off_center_y"] = -0.08 + (seed % 7) * 0.03
        meta["rotation"] = float(meta.get("rotation", 0.0)) + 0.18
    elif mode == "layered":
        layered: list[dict[str, Any]] = []
        for i, p in enumerate(primitives):
            copy = dict(p)
            copy["stroke"] = copy.get("stroke") or "#e8eef8"
            copy["opacity"] = 0.35 + 0.45 * (i % 3) / 2.0
            layered.append(copy)
        out["primitives"] = layered + primitives
    elif mode == "fragment":
        keep = rng.random(len(primitives)) > 0.45 if primitives else []
        out["primitives"] = [p for p, k in zip(primitives, keep, strict=False) if k]
        if edges:
            ekeep = rng.random(len(edges)) > 0.55
            out["edges"] = [e for e, k in zip(edges, ekeep, strict=False) if k]
    elif mode == "broken-symmetry":
        if primitives:
            cut = max(1, len(primitives) // 2)
            out["primitives"] = primitives[:cut] + primitives[cut + 1 :]
        if edges:
            out["edges"] = edges[::2]
        meta["rotation"] = float(meta.get("rotation", 0.0)) + 0.42

    out["meta"] = meta
    return out
