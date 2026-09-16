"""Deterministic noise landscape + overlays using NUMBRANE RNG (no Python random)."""

from __future__ import annotations

from typing import Any

import numpy as np
from PIL import Image, ImageDraw

from numbrane_python.rng import Rng


def _value_noise2d(width: int, height: int, scale: float, octaves: int, seed: int) -> np.ndarray:
    """Simple deterministic fBm from NAP xoshiro (no external noise package required)."""
    rng = Rng(seed & 0xFFFFFFFF)
    # grid of random gradients/values
    gw = max(2, int(width / scale) + 3)
    gh = max(2, int(height / scale) + 3)
    base = np.zeros((gh, gw), dtype=np.float64)
    for y in range(gh):
        for x in range(gw):
            base[y, x] = rng.random_f64()

    def sample(ix: float, iy: float) -> float:
        x0 = int(np.floor(ix)) % (gw - 1)
        y0 = int(np.floor(iy)) % (gh - 1)
        x1 = x0 + 1
        y1 = y0 + 1
        tx = ix - np.floor(ix)
        ty = iy - np.floor(iy)
        a = base[y0, x0] * (1 - tx) + base[y0, x1] * tx
        b = base[y1, x0] * (1 - tx) + base[y1, x1] * tx
        return a * (1 - ty) + b * ty

    out = np.zeros((height, width), dtype=np.float64)
    amp = 1.0
    freq = 1.0
    total = 0.0
    for _ in range(max(1, octaves)):
        for y in range(height):
            for x in range(width):
                out[y, x] += amp * sample(x / scale * freq, y / scale * freq)
        total += amp
        amp *= 0.5
        freq *= 2.0
    out /= total
    out = (out - out.min()) / (out.max() - out.min() + 1e-12)
    return out


def _palette(rng: Rng, n: int = 8) -> list[tuple[int, int, int]]:
    colors = []
    for _ in range(n):
        colors.append(
            (
                50 + int(rng.random_f64() * 205),
                50 + int(rng.random_f64() * 205),
                50 + int(rng.random_f64() * 205),
            )
        )
    return colors


def render_noise_landscape(recipe: dict[str, Any]) -> Image.Image:
    """Render a deterministic landscape image from a NAP recipe."""
    seed = int(recipe.get("seed", 0)) & 0xFFFFFFFF
    params = recipe.get("parameters") or {}
    size = int(params.get("field.size", params.get("size", 128)))
    width = int(recipe.get("width") or params.get("width") or size)
    height = int(recipe.get("height") or params.get("height") or size)
    scale = float(params.get("field.scale", params.get("scale", 24.0)))
    octaves = int(params.get("field.octaves", params.get("octaves", 4)))
    particles = int(params.get("sim.particles", 40))

    heightmap = _value_noise2d(width, height, scale, octaves, seed)
    rng = Rng(seed ^ 0xA5A5A5A5)
    palette = _palette(rng, 8)

    img = Image.new("RGB", (width, height))
    px = img.load()
    for y in range(height):
        for x in range(width):
            t = heightmap[y, x]
            i0 = min(len(palette) - 2, int(t * (len(palette) - 1)))
            c0 = palette[i0]
            c1 = palette[i0 + 1]
            u = t * (len(palette) - 1) - i0
            px[x, y] = tuple(int(c0[i] + (c1[i] - c0[i]) * u) for i in range(3))

    draw = ImageDraw.Draw(img)
    for _ in range(particles):
        x = int(rng.random_f64() * max(1, width - 1))
        y = int(rng.random_f64() * max(1, height - 1))
        r = 1 + int(rng.random_f64() * 4)
        color = palette[int(rng.random_f64() * len(palette))]
        draw.ellipse((x - r, y - r, x + r, y + r), fill=color)

    overlay_kind = str(params.get("overlay", params.get("landscape.overlay", ""))).lower()
    if overlay_kind in {"bezier", "concentric", "rects", "nested", "nested-rectangles"}:
        from numbrane_python.landscape.overlays import (
            bezier_overlay,
            compose_landscape_with_overlay,
            concentric_overlay,
            nested_rectangles_overlay,
        )

        base = np.asarray(img, dtype=np.uint8)
        if overlay_kind == "bezier":
            ov = bezier_overlay(width, height, seed ^ 0xBEEF)
        elif overlay_kind == "concentric":
            ov = concentric_overlay(width, height, seed ^ 0xC0DE)
        else:
            ov = nested_rectangles_overlay(width, height, seed ^ 0xFACE)
        composed = compose_landscape_with_overlay(base, ov)
        img = Image.fromarray(composed)
    return img
