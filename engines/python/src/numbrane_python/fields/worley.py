"""Worley noise (cellular noise) implementation."""

import numpy as np

from numbrane_python.fields.noise import hash_coords


def worley_noise(
    coords: np.ndarray,
    seed: int = 0,
    num_points: int = 9,
    metric: str = "euclidean",
) -> np.ndarray:
    """Worley (cellular) noise.

    Args:
        coords: Coordinates (..., 2) or (..., 3)
        seed: Random seed
        num_points: Number of feature points per cell (typically 9 for 2D, 27 for 3D)
        metric: Distance metric ('euclidean', 'manhattan', 'chebyshev')

    Returns:
        Distance to nearest feature point (normalized)
    """
    coords_flat = coords.reshape(-1, coords.shape[-1])
    dims = coords.shape[-1]

    # Get cell coordinates
    cell_coords = np.floor(coords_flat).astype(np.int32)
    frac = coords_flat - cell_coords

    min_dist = np.full(len(coords_flat), np.inf)

    # Check neighboring cells
    if dims == 2:
        offsets = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 0), (0, 1), (1, -1), (1, 0), (1, 1)]
    else:  # dims == 3
        offsets = []
        for dz in [-1, 0, 1]:
            for dy in [-1, 0, 1]:
                for dx in [-1, 0, 1]:
                    offsets.append((dx, dy, dz))

    for offset in offsets[:num_points]:
        check_cell = cell_coords.copy()
        for d in range(dims):
            check_cell[:, d] += offset[d]

        # Generate feature point in this cell using hash
        # Create unique hash per cell
        cell_hash_input = np.zeros((len(coords_flat), dims + 1))
        cell_hash_input[:, :dims] = check_cell.astype(np.float64)
        cell_hash_input[:, dims] = seed

        cell_hash = hash_coords(cell_hash_input, seed)

        # Use hash to place feature point in cell
        feature_pos = np.zeros_like(coords_flat)
        for d in range(dims):
            # Use hash value for this dimension
            if isinstance(cell_hash, np.ndarray):
                if len(cell_hash.shape) == 0:
                    h_val = float(cell_hash)
                else:
                    h_val = float(cell_hash[0]) if len(cell_hash) > 0 else 0.5
            else:
                h_val = float(cell_hash)

            # Generate position in cell [0, 1] using hash
            # Use different hash seeds for each dimension
            hash_coords_dim = check_cell.astype(np.float64).copy()
            hash_coords_dim[:, d] += d * 1000.0
            h_val = hash_coords(hash_coords_dim, seed + d)

            if isinstance(h_val, np.ndarray):
                h_val = float(h_val[0]) if len(h_val) > 0 else 0.5
            else:
                h_val = float(h_val)

            feature_pos[:, d] = check_cell[:, d].astype(float) + h_val

        # Compute distance
        if metric == "euclidean":
            dist = np.sqrt(np.sum((coords_flat - feature_pos) ** 2, axis=1))
        elif metric == "manhattan":
            dist = np.sum(np.abs(coords_flat - feature_pos), axis=1)
        elif metric == "chebyshev":
            dist = np.max(np.abs(coords_flat - feature_pos), axis=1)
        else:
            dist = np.sqrt(np.sum((coords_flat - feature_pos) ** 2, axis=1))

        min_dist = np.minimum(min_dist, dist)

    # Normalize (rough approximation)
    return min_dist.reshape(coords.shape[:-1]) / np.sqrt(dims)
