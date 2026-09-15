"""Color palettes for generative art."""

import numpy as np

# Curated palettes
PALETTES = {
    "void": [
        (0, 0, 0),
        (10, 10, 30),
        (20, 15, 40),
        (30, 25, 50),
        (50, 40, 70),
        (80, 60, 100),
    ],
    "sunset": [
        (20, 10, 30),
        (60, 20, 50),
        (100, 40, 60),
        (150, 80, 70),
        (200, 120, 80),
        (255, 180, 120),
    ],
    "ocean": [
        (0, 20, 40),
        (10, 40, 60),
        (20, 60, 80),
        (40, 100, 120),
        (60, 140, 160),
        (100, 180, 200),
    ],
    "forest": [
        (10, 20, 10),
        (20, 40, 20),
        (40, 60, 30),
        (60, 80, 40),
        (80, 120, 50),
        (120, 160, 70),
    ],
    "fire": [
        (0, 0, 0),
        (40, 10, 0),
        (80, 30, 0),
        (150, 60, 0),
        (220, 120, 20),
        (255, 200, 100),
    ],
    "ice": [
        (0, 10, 20),
        (20, 40, 60),
        (40, 80, 100),
        (80, 120, 140),
        (120, 160, 180),
        (180, 220, 255),
    ],
    "neon": [
        (0, 0, 0),
        (50, 0, 100),
        (100, 0, 200),
        (150, 50, 255),
        (200, 100, 255),
        (255, 150, 255),
    ],
    "earth": [
        (20, 15, 10),
        (40, 30, 20),
        (60, 50, 30),
        (80, 70, 40),
        (120, 100, 60),
        (160, 140, 100),
    ],
    "aurora": [
        (0, 10, 20),
        (0, 40, 60),
        (0, 80, 100),
        (50, 120, 150),
        (100, 180, 200),
        (150, 220, 255),
    ],
    "cosmic": [
        (5, 5, 15),
        (15, 10, 30),
        (30, 20, 50),
        (60, 40, 80),
        (100, 70, 120),
        (150, 120, 180),
    ],
    # Gallery-friendly ink / paper palettes
    "ink": [
        (8, 8, 12),
        (24, 28, 40),
        (60, 70, 90),
        (120, 130, 150),
        (190, 195, 205),
        (235, 238, 242),
    ],
    "duotone-teal": [
        (8, 16, 20),
        (20, 45, 55),
        (40, 90, 100),
        (70, 140, 145),
        (140, 190, 180),
        (220, 235, 225),
    ],
    "duotone-ember": [
        (12, 8, 8),
        (40, 18, 14),
        (90, 35, 25),
        (160, 70, 40),
        (210, 130, 80),
        (245, 210, 170),
    ],
    "light-paper": [
        (250, 246, 238),
        (230, 220, 205),
        (180, 160, 140),
        (100, 85, 70),
        (45, 38, 32),
        (18, 16, 14),
    ],
    "high-contrast": [
        (0, 0, 0),
        (20, 20, 20),
        (80, 80, 80),
        (160, 160, 160),
        (220, 220, 220),
        (255, 255, 255),
    ],
}


def cosine_palette(
    t: np.ndarray,
    a: tuple[float, float, float],
    b: tuple[float, float, float],
    c: tuple[float, float, float],
    d: tuple[float, float, float],
) -> np.ndarray:
    """Generate cosine-interpolated palette.

    Args:
        t: Values in [0, 1]
        a: First color (R, G, B) in [0, 1]
        b: Second color
        c: Third color
        d: Fourth color

    Returns:
        RGB array (..., 3) in [0, 255]
    """
    t = np.clip(t, 0, 1)
    cos_t = np.cos(t * 2 * np.pi)

    r = a[0] + b[0] * cos_t + c[0] * np.cos(2 * t * np.pi) + d[0] * np.cos(3 * t * np.pi)
    g = a[1] + b[1] * cos_t + c[1] * np.cos(2 * t * np.pi) + d[1] * np.cos(3 * t * np.pi)
    b_val = a[2] + b[2] * cos_t + c[2] * np.cos(2 * t * np.pi) + d[2] * np.cos(3 * t * np.pi)

    rgb = np.stack([r, g, b_val], axis=-1)
    rgb = np.clip(rgb, 0, 1) * 255
    return rgb.astype(np.uint8)


def gradient_map(values: np.ndarray, anchors: list[tuple[int, int, int]]) -> np.ndarray:
    """Map values to gradient from anchor colors.

    Args:
        values: Scalar values (will be normalized to [0, 1])
        anchors: List of (R, G, B) anchor colors

    Returns:
        RGB array (..., 3) in [0, 255]
    """
    values = np.clip(values, 0, 1)

    if len(anchors) == 0:
        return np.zeros((*values.shape, 3), dtype=np.uint8)
    if len(anchors) == 1:
        return np.full((*values.shape, 3), anchors[0], dtype=np.uint8)

    # Normalize to [0, 1] range for interpolation
    n_segments = len(anchors) - 1
    segment = values * n_segments
    segment_idx = np.clip(np.floor(segment).astype(int), 0, n_segments - 1)
    t = segment - segment_idx

    # Interpolate
    result = np.zeros((*values.shape, 3), dtype=np.float32)
    for i in range(len(anchors) - 1):
        mask = segment_idx == i
        if np.any(mask):
            c0 = np.array(anchors[i], dtype=np.float32)
            c1 = np.array(anchors[i + 1], dtype=np.float32)
            result[mask] = c0 + (c1 - c0) * t[mask, np.newaxis]

    return np.clip(result, 0, 255).astype(np.uint8)


def get_palette(name: str) -> list[tuple[int, int, int]]:
    """Get a curated palette by name.

    Args:
        name: Palette name

    Returns:
        List of (R, G, B) colors
    """
    return PALETTES.get(name, PALETTES["void"])
