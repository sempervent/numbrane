"""Escape-time Mandelbrot still renderer (Python reference)."""

from __future__ import annotations

from typing import Any

import numpy as np

from numbrane_python.render.palettes import get_palette, gradient_map


def render_escape_time(
    recipe: dict[str, Any],
    *,
    width: int,
    height: int,
    frame: int = 0,
) -> np.ndarray:
    params = recipe.get("parameters") or {}
    seed = int(recipe.get("seed", 42)) & 0xFFFFFFFF
    center = params.get("center", [-0.5, 0.0])
    if isinstance(center, dict):
        cx, cy = float(center.get("x", -0.5)), float(center.get("y", 0.0))
    else:
        cx, cy = float(center[0]), float(center[1])
    zoom = float(params.get("zoom", 1.0)) * (1.0 + frame * 0.0)
    power = float(params.get("power", 2.0))
    max_iter = int(params.get("iterations", params.get("max_iter", 128)))
    max_iter = min(max_iter, 512)
    # seed nudges center slightly for variation without changing math family
    rng = np.random.default_rng(seed)
    cx += float(rng.uniform(-0.02, 0.02)) / max(zoom, 0.1)
    cy += float(rng.uniform(-0.02, 0.02)) / max(zoom, 0.1)

    aspect = width / max(height, 1)
    xs = np.linspace(cx - aspect / zoom, cx + aspect / zoom, width, dtype=np.float64)
    ys = np.linspace(cy - 1.0 / zoom, cy + 1.0 / zoom, height, dtype=np.float64)
    xv, yv = np.meshgrid(xs, ys)
    c = xv + 1j * yv
    z = np.zeros_like(c)
    escaped = np.zeros(c.shape, dtype=np.float32)
    active = np.ones(c.shape, dtype=bool)
    for i in range(max_iter):
        z[active] = z[active] ** power + c[active]
        mask = (np.abs(z) > 4.0) & active
        escaped[mask] = i + 1 - np.log2(np.log2(np.abs(z[mask]) + 1e-9))
        active &= ~mask
        if not active.any():
            break
    field = escaped / max(max_iter, 1)
    field = np.nan_to_num(field, nan=0.0, posinf=1.0, neginf=0.0)
    palette = str(params.get("palette", "void"))
    return gradient_map(field, get_palette(palette)).astype(np.uint8)
