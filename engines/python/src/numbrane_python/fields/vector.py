"""Vector field implementations."""

from abc import ABC, abstractmethod

import numpy as np

from numbrane_python.fields.noise import fbm
from numbrane_python.fields.scalar import ScalarField


class VectorField(ABC):
    """Abstract base class for vector fields."""

    @abstractmethod
    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
        """Sample field at positions.

        Args:
            x: X coordinates (can be array)
            y: Y coordinates (can be array)
            t: Time parameter

        Returns:
            Tuple of (vx, vy) vector components
        """
        pass


class CurlNoiseField(VectorField):
    """Curl noise field (divergence-free vector field)."""

    def __init__(self, scale: float = 1.0, strength: float = 1.0, octaves: int = 4, seed: int = 0):
        """Initialize curl noise field.

        Args:
            scale: Scale factor for coordinates
            strength: Strength of the field
            octaves: Number of octaves
            seed: Random seed
        """
        self.scale = scale
        self.strength = strength
        self.octaves = octaves
        self.seed = seed

    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
        """Sample curl noise field.

        Curl noise is computed as:
        vx = d(noise)/dy
        vy = -d(noise)/dx
        """
        eps = 0.01

        # Sample noise at offset positions for gradient
        x_arr = np.asarray(x, dtype=float)
        y_arr = np.asarray(y, dtype=float)
        t_arr = np.full_like(x_arr, float(t), dtype=float)
        coords_base = np.stack(
            [x_arr * self.scale, y_arr * self.scale, t_arr * self.scale], axis=-1
        )

        # Compute gradient using finite differences
        coords_dx = coords_base.copy()
        coords_dx[..., 0] += eps
        noise_dx = fbm(coords_dx, octaves=self.octaves, seed=self.seed)
        noise_base = fbm(coords_base, octaves=self.octaves, seed=self.seed)

        coords_dy = coords_base.copy()
        coords_dy[..., 1] += eps
        noise_dy = fbm(coords_dy, octaves=self.octaves, seed=self.seed)

        # Curl: vx = d/dy, vy = -d/dx
        vx = (noise_dy - noise_base) / eps
        vy = -(noise_dx - noise_base) / eps

        return vx * self.strength, vy * self.strength


class VortexField(VectorField):
    """Vortex field (circular flow around center)."""

    def __init__(self, center_x: float = 0.5, center_y: float = 0.5, strength: float = 1.0):
        """Initialize vortex field.

        Args:
            center_x: Center X coordinate (normalized)
            center_y: Center Y coordinate (normalized)
            strength: Rotation strength
        """
        self.center_x = center_x
        self.center_y = center_y
        self.strength = strength

    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
        """Sample vortex field."""
        dx = x - self.center_x
        dy = y - self.center_y

        # Perpendicular vector for rotation
        vx = -dy * self.strength
        vy = dx * self.strength

        return vx, vy


class AttractorField(VectorField):
    """Attractor field (points attract particles)."""

    def __init__(self, points: np.ndarray, strength: float = 1.0, falloff: float = 2.0):
        """Initialize attractor field.

        Args:
            points: Array of (x, y) attractor points
            strength: Attraction strength
            falloff: Distance falloff power
        """
        self.points = points
        self.strength = strength
        self.falloff = falloff

    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
        """Sample attractor field."""
        if len(self.points) == 0:
            return np.zeros_like(x), np.zeros_like(y)

        vx_total = np.zeros_like(x)
        vy_total = np.zeros_like(y)

        x_expanded = x[..., np.newaxis]
        y_expanded = y[..., np.newaxis]

        for point in self.points:
            dx = point[0] - x_expanded
            dy = point[1] - y_expanded
            dist_sq = dx**2 + dy**2 + 1e-6  # Avoid division by zero

            # Normalize and apply falloff
            dist = np.sqrt(dist_sq)
            force = self.strength / (dist**self.falloff + 1e-6)

            vx_total += (dx / dist) * force
            vy_total += (dy / dist) * force

        return vx_total, vy_total


class RepulsorField(VectorField):
    """Repulsor field (points repel particles)."""

    def __init__(self, points: np.ndarray, strength: float = 1.0, falloff: float = 2.0):
        """Initialize repulsor field.

        Args:
            points: Array of (x, y) repulsor points
            strength: Repulsion strength
            falloff: Distance falloff power
        """
        self.points = points
        self.strength = strength
        self.falloff = falloff

    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
        """Sample repulsor field."""
        if len(self.points) == 0:
            return np.zeros_like(x), np.zeros_like(y)

        vx_total = np.zeros_like(x)
        vy_total = np.zeros_like(y)

        x_expanded = x[..., np.newaxis]
        y_expanded = y[..., np.newaxis]

        for point in self.points:
            dx = x_expanded - point[0]
            dy = y_expanded - point[1]
            dist_sq = dx**2 + dy**2 + 1e-6

            dist = np.sqrt(dist_sq)
            force = self.strength / (dist**self.falloff + 1e-6)

            vx_total += (dx / dist) * force
            vy_total += (dy / dist) * force

        return vx_total, vy_total


class ConstantVectorField(VectorField):
    """Constant vector field."""

    def __init__(self, vx: float = 0.0, vy: float = 0.0):
        """Initialize constant vector field.

        Args:
            vx: Constant X component
            vy: Constant Y component
        """
        self.vx = vx
        self.vy = vy

    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
        """Sample constant vector field."""
        return np.full_like(x, self.vx), np.full_like(y, self.vy)


class GradientField(VectorField):
    """Vector field from gradient of scalar field."""

    def __init__(self, scalar_field: ScalarField, strength: float = 1.0):
        """Initialize gradient field.

        Args:
            scalar_field: Scalar field to take gradient of
            strength: Gradient strength
        """
        self.scalar_field = scalar_field
        self.strength = strength

    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
        """Sample gradient field."""
        eps = 0.01

        # Compute gradient using finite differences
        val_base = self.scalar_field.sample(x, y, t)
        val_dx = self.scalar_field.sample(x + eps, y, t)
        val_dy = self.scalar_field.sample(x, y + eps, t)

        vx = (val_dx - val_base) / eps
        vy = (val_dy - val_base) / eps

        return vx * self.strength, vy * self.strength
