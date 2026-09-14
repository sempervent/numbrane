"""Landscape algorithmic overlays: Bézier, concentric, nested rectangles."""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw


def bezier_overlay(
    width: int,
    height: int,
    seed: int,
    *,
    curves: int = 12,
    color: tuple[int, int, int] = (180, 200, 220),
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    img = Image.new("RGB", (width, height), (0, 0, 0))
    draw = ImageDraw.Draw(img)
    for _ in range(curves):
        pts = [
            (rng.uniform(0, width), rng.uniform(0, height)),
            (rng.uniform(0, width), rng.uniform(0, height)),
            (rng.uniform(0, width), rng.uniform(0, height)),
            (rng.uniform(0, width), rng.uniform(0, height)),
        ]
        # approximate cubic with polyline
        path = []
        for t in np.linspace(0, 1, 48):
            x = (
                (1 - t) ** 3 * pts[0][0]
                + 3 * (1 - t) ** 2 * t * pts[1][0]
                + 3 * (1 - t) * t**2 * pts[2][0]
                + t**3 * pts[3][0]
            )
            y = (
                (1 - t) ** 3 * pts[0][1]
                + 3 * (1 - t) ** 2 * t * pts[1][1]
                + 3 * (1 - t) * t**2 * pts[2][1]
                + t**3 * pts[3][1]
            )
            path.append((x, y))
        draw.line(path, fill=color, width=2)
    return np.asarray(img, dtype=np.uint8)


def concentric_overlay(
    width: int,
    height: int,
    seed: int,
    *,
    rings: int = 18,
    color: tuple[int, int, int] = (160, 190, 210),
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    img = Image.new("RGB", (width, height), (0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = width * rng.uniform(0.35, 0.65), height * rng.uniform(0.35, 0.65)
    max_r = max(width, height)
    for i in range(rings):
        r = max_r * (i + 1) / rings
        bbox = [cx - r, cy - r, cx + r, cy + r]
        draw.ellipse(bbox, outline=color, width=2)
    return np.asarray(img, dtype=np.uint8)


def nested_rectangles_overlay(
    width: int,
    height: int,
    seed: int,
    *,
    count: int = 14,
    color: tuple[int, int, int] = (200, 180, 140),
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    img = Image.new("RGB", (width, height), (0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = min(width, height) * 0.04
    for i in range(count):
        t = i / max(count, 1)
        x0 = pad + t * width * 0.35 + rng.uniform(-pad, pad)
        y0 = pad + t * height * 0.35 + rng.uniform(-pad, pad)
        x1 = width - pad - t * width * 0.35 + rng.uniform(-pad, pad)
        y1 = height - pad - t * height * 0.35 + rng.uniform(-pad, pad)
        draw.rectangle([x0, y0, x1, y1], outline=color, width=2)
    return np.asarray(img, dtype=np.uint8)


def compose_landscape_with_overlay(
    base: np.ndarray,
    overlay: np.ndarray,
    *,
    amount: float = 0.55,
) -> np.ndarray:
    a = base.astype(np.float32)
    b = overlay.astype(np.float32)
    out = np.clip(a * (1.0 - amount) + b * amount, 0, 255).astype(np.uint8)
    return out
