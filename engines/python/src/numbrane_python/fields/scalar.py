"""Scalar field implementations."""

from abc import ABC, abstractmethod

import numpy as np

from numbrane_python.fields.noise import fbm, ridged_noise


class ScalarField(ABC):
    """Abstract base class for scalar fields."""

    @abstractmethod
    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> np.ndarray:
        """Sample field at positions.

        Args:
            x: X coordinates (can be array)
            y: Y coordinates (can be array)
            t: Time parameter

        Returns:
            Scalar values at positions
        """
        pass


class NoiseField(ScalarField):
    """Perlin-like noise field."""

    def __init__(self, scale: float = 1.0, octaves: int = 4, seed: int = 0):
        """Initialize noise field.

        Args:
            scale: Scale factor for coordinates
            octaves: Number of octaves for FBM
            seed: Random seed
        """
        self.scale = scale
        self.octaves = octaves
        self.seed = seed

    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> np.ndarray:
        """Sample noise field."""
        x_arr = np.asarray(x, dtype=float)
        y_arr = np.asarray(y, dtype=float)
        t_arr = np.full_like(x_arr, float(t), dtype=float)
        coords = np.stack([x_arr * self.scale, y_arr * self.scale, t_arr * self.scale], axis=-1)
        return fbm(coords, octaves=self.octaves, seed=self.seed)


class RidgedNoiseField(ScalarField):
    """Ridged noise field."""

    def __init__(self, scale: float = 1.0, octaves: int = 4, seed: int = 0):
        """Initialize ridged noise field.

        Args:
            scale: Scale factor
            octaves: Number of octaves
            seed: Random seed
        """
        self.scale = scale
        self.octaves = octaves
        self.seed = seed

    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> np.ndarray:
        """Sample ridged noise field."""
        x_arr = np.asarray(x, dtype=float)
        y_arr = np.asarray(y, dtype=float)
        t_arr = np.full_like(x_arr, float(t), dtype=float)
        coords = np.stack([x_arr * self.scale, y_arr * self.scale, t_arr * self.scale], axis=-1)
        return ridged_noise(coords, octaves=self.octaves, seed=self.seed)


class RadialGradientField(ScalarField):
    """Radial gradient from center."""

    def __init__(self, center_x: float = 0.5, center_y: float = 0.5, radius: float = 1.0):
        """Initialize radial gradient.

        Args:
            center_x: Center X coordinate (normalized)
            center_y: Center Y coordinate (normalized)
            radius: Radius of gradient
        """
        self.center_x = center_x
        self.center_y = center_y
        self.radius = radius

    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> np.ndarray:
        """Sample radial gradient."""
        dx = x - self.center_x
        dy = y - self.center_y
        dist = np.sqrt(dx**2 + dy**2)
        return np.clip(1.0 - dist / self.radius, 0.0, 1.0)


class DistanceTransformField(ScalarField):
    """Distance transform from points."""

    def __init__(self, points: np.ndarray, power: float = 2.0):
        """Initialize distance transform.

        Args:
            points: Array of (x, y) points
            power: Power for distance calculation (2.0 = Euclidean)
        """
        self.points = points
        self.power = power

    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> np.ndarray:
        """Sample distance transform."""
        if len(self.points) == 0:
            return np.zeros_like(x)

        # Compute distances to all points
        x_expanded = x[..., np.newaxis]
        y_expanded = y[..., np.newaxis]

        dx = x_expanded - self.points[:, 0]
        dy = y_expanded - self.points[:, 1]

        if self.power == 2.0:
            dists = np.sqrt(dx**2 + dy**2)
        else:
            dists = (np.abs(dx) ** self.power + np.abs(dy) ** self.power) ** (1.0 / self.power)

        # Return minimum distance
        return np.min(dists, axis=-1)


class ConstantField(ScalarField):
    """Constant scalar field."""

    def __init__(self, value: float = 1.0):
        """Initialize constant field.

        Args:
            value: Constant value
        """
        self.value = value

    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> np.ndarray:
        """Sample constant field."""
        return np.full_like(x, self.value)


class TimeModulatedField(ScalarField):
    """Time-modulated scalar field."""

    def __init__(self, field: ScalarField, frequency: float = 1.0, amplitude: float = 1.0):
        """Initialize time-modulated field.

        Args:
            field: Base field to modulate
            frequency: Time frequency
            amplitude: Modulation amplitude
        """
        self.field = field
        self.frequency = frequency
        self.amplitude = amplitude

    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> np.ndarray:
        """Sample time-modulated field."""
        base = self.field.sample(x, y, t)
        modulation = np.sin(t * self.frequency * 2 * np.pi) * self.amplitude
        return base + modulation
