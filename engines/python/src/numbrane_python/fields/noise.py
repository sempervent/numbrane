"""Noise generation functions."""

import numpy as np


def hash_coords(coords: np.ndarray, seed: int = 0) -> np.ndarray:
    """Hash coordinates to pseudo-random values.

    Args:
        coords: Array of coordinates (..., D)
        seed: Random seed

    Returns:
        Hash values in [0, 1)
    """
    # Simple hash function
    coords_int = (coords * 1000).astype(np.int64)
    hash_val = coords_int[..., 0] * 73856093
    for i in range(1, coords_int.shape[-1]):
        hash_val ^= coords_int[..., i] * (19349663 + i * 83492791)
    hash_val ^= np.int64(int(seed) & 0x7FFFFFFF) * np.int64(50331653)
    hash_val = hash_val & np.int64(0x7FFFFFFF)
    return (hash_val % 1000000) / 1000000.0


def smoothstep(t: np.ndarray) -> np.ndarray:
    """Smooth interpolation function.

    Args:
        t: Values in [0, 1]

    Returns:
        Smoothed values
    """
    return t * t * (3.0 - 2.0 * t)


def lerp(a: np.ndarray, b: np.ndarray, t: np.ndarray) -> np.ndarray:
    """Linear interpolation.

    Args:
        a: Start values
        b: End values
        t: Interpolation factor [0, 1]

    Returns:
        Interpolated values
    """
    return a + t * (b - a)


def noise2d(coords: np.ndarray, seed: int = 0) -> np.ndarray:
    """2D/3D noise function (simplified Perlin-like).

    Args:
        coords: Coordinates (..., D) where D is 2 or 3
        seed: Random seed

    Returns:
        Noise values in [-1, 1]
    """
    # Get integer grid coordinates
    coords_flat = coords.reshape(-1, coords.shape[-1])
    grid_coords = np.floor(coords_flat).astype(np.int32)
    frac = coords_flat - grid_coords

    # Smooth interpolation
    t = smoothstep(frac)

    # Hash corner values
    corners = []
    dims = coords.shape[-1]

    # Generate all 2^dims corners
    for i in range(2**dims):
        corner_coords = grid_coords.copy()
        for d in range(dims):
            if (i >> d) & 1:
                corner_coords[:, d] += 1
        corners.append(hash_coords(corner_coords.astype(np.float64), seed) * 2.0 - 1.0)

    # Interpolate
    if dims == 2:
        # Bilinear interpolation
        n00, n10, n01, n11 = corners
        nx0 = lerp(n00, n10, t[:, 0:1])
        nx1 = lerp(n01, n11, t[:, 0:1])
        result = lerp(nx0, nx1, t[:, 1:2])
    else:  # dims == 3
        # Trilinear interpolation
        n000, n100, n010, n110, n001, n101, n011, n111 = corners
        nx00 = lerp(n000, n100, t[:, 0:1])
        nx10 = lerp(n010, n110, t[:, 0:1])
        nx01 = lerp(n001, n101, t[:, 0:1])
        nx11 = lerp(n011, n111, t[:, 0:1])
        ny0 = lerp(nx00, nx10, t[:, 1:2])
        ny1 = lerp(nx01, nx11, t[:, 1:2])
        result = lerp(ny0, ny1, t[:, 2:3])

    return result.reshape(coords.shape[:-1])


def fbm(
    coords: np.ndarray, octaves: int = 4, seed: int = 0, lacunarity: float = 2.0, gain: float = 0.5
) -> np.ndarray:
    """Fractional Brownian motion (fBm).

    Args:
        coords: Coordinates (..., D)
        octaves: Number of octaves
        seed: Random seed
        lacunarity: Frequency multiplier per octave
        gain: Amplitude multiplier per octave

    Returns:
        fBm values
    """
    value = np.zeros(coords.shape[:-1])
    amplitude = 1.0
    frequency = 1.0

    for i in range(octaves):
        value += noise2d(coords * frequency, seed + i) * amplitude
        frequency *= lacunarity
        amplitude *= gain

    return value


def ridged_noise(
    coords: np.ndarray, octaves: int = 4, seed: int = 0, lacunarity: float = 2.0, gain: float = 0.5
) -> np.ndarray:
    """Ridged noise (absolute value of fBm).

    Args:
        coords: Coordinates (..., D)
        octaves: Number of octaves
        seed: Random seed
        lacunarity: Frequency multiplier per octave
        gain: Amplitude multiplier per octave

    Returns:
        Ridged noise values
    """
    value = np.zeros(coords.shape[:-1])
    amplitude = 1.0
    frequency = 1.0

    for i in range(octaves):
        n = noise2d(coords * frequency, seed + i)
        value += (1.0 - np.abs(n)) * amplitude
        frequency *= lacunarity
        amplitude *= gain

    return value
