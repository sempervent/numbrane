"""Raster → mathematical field transforms for Seed Artifacts."""

from __future__ import annotations

import numpy as np
from PIL import Image


def _to_gray(path_or_arr: str | np.ndarray) -> np.ndarray:
    if isinstance(path_or_arr, np.ndarray):
        arr = path_or_arr
        if arr.ndim == 3:
            return arr.mean(axis=2).astype(np.float32)
        return arr.astype(np.float32)
    img = Image.open(path_or_arr).convert("L")
    return np.asarray(img, dtype=np.float32) / 255.0


def raster_to_nutrient_map(path_or_arr: str | np.ndarray) -> np.ndarray:
    """Grayscale intensity as nutrient / reaction initial V field [0,1]."""
    g = _to_gray(path_or_arr)
    g = (g - g.min()) / max(float(g.max() - g.min()), 1e-6)
    return g.astype(np.float32)


def raster_to_emission_density(path_or_arr: str | np.ndarray) -> np.ndarray:
    """Emphasize bright regions as particle emission density."""
    g = raster_to_nutrient_map(path_or_arr)
    return np.clip(g**1.4, 0, 1).astype(np.float32)


def raster_to_displacement(path_or_arr: str | np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Sobel-ish gradients → displacement / vector field (dx, dy) normalized."""
    g = raster_to_nutrient_map(path_or_arr)
    gy, gx = np.gradient(g)
    mag = np.sqrt(gx * gx + gy * gy) + 1e-6
    return (gx / mag).astype(np.float32), (gy / mag).astype(np.float32)
