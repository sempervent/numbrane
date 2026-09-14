"""Field composition utilities."""


import numpy as np

from numbrane_python.fields.scalar import ScalarField
from numbrane_python.fields.vector import VectorField


class AddScalarField(ScalarField):
    """Add two scalar fields."""

    def __init__(self, field1: ScalarField, field2: ScalarField):
        """Initialize additive composition.

        Args:
            field1: First field
            field2: Second field
        """
        self.field1 = field1
        self.field2 = field2

    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> np.ndarray:
        """Sample sum of fields."""
        return self.field1.sample(x, y, t) + self.field2.sample(x, y, t)


class MultiplyScalarField(ScalarField):
    """Multiply scalar field by constant or another field."""

    def __init__(self, field: ScalarField, factor: float | ScalarField):
        """Initialize multiplication.

        Args:
            field: Base field
            factor: Multiplier (constant or field)
        """
        self.field = field
        self.factor = factor

    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> np.ndarray:
        """Sample multiplied field."""
        base = self.field.sample(x, y, t)
        if isinstance(self.factor, ScalarField):
            mult = self.factor.sample(x, y, t)
        else:
            mult = self.factor
        return base * mult


class BlendScalarField(ScalarField):
    """Blend two scalar fields."""

    def __init__(
        self, field1: ScalarField, field2: ScalarField, alpha: float | ScalarField = 0.5
    ):
        """Initialize blend.

        Args:
            field1: First field
            field2: Second field
            alpha: Blend factor [0, 1] or field
        """
        self.field1 = field1
        self.field2 = field2
        self.alpha = alpha

    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> np.ndarray:
        """Sample blended field."""
        v1 = self.field1.sample(x, y, t)
        v2 = self.field2.sample(x, y, t)

        if isinstance(self.alpha, ScalarField):
            a = self.alpha.sample(x, y, t)
        else:
            a = self.alpha

        return v1 * (1.0 - a) + v2 * a


class DomainWarpScalarField(ScalarField):
    """Domain-warped scalar field."""

    def __init__(self, field: ScalarField, warp_field: VectorField, strength: float = 1.0):
        """Initialize domain warp.

        Args:
            field: Field to warp
            warp_field: Vector field for warping
            strength: Warp strength
        """
        self.field = field
        self.warp_field = warp_field
        self.strength = strength

    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> np.ndarray:
        """Sample domain-warped field."""
        vx, vy = self.warp_field.sample(x, y, t)
        warped_x = x + vx * self.strength
        warped_y = y + vy * self.strength
        return self.field.sample(warped_x, warped_y, t)


class AddVectorField(VectorField):
    """Add two vector fields."""

    def __init__(self, field1: VectorField, field2: VectorField):
        """Initialize additive composition.

        Args:
            field1: First field
            field2: Second field
        """
        self.field1 = field1
        self.field2 = field2

    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> tuple:
        """Sample sum of fields."""
        vx1, vy1 = self.field1.sample(x, y, t)
        vx2, vy2 = self.field2.sample(x, y, t)
        return vx1 + vx2, vy1 + vy2


class MultiplyVectorField(VectorField):
    """Multiply vector field by scalar."""

    def __init__(self, field: VectorField, factor: float | ScalarField):
        """Initialize multiplication.

        Args:
            field: Base field
            factor: Multiplier
        """
        self.field = field
        self.factor = factor

    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> tuple:
        """Sample multiplied field."""
        vx, vy = self.field.sample(x, y, t)
        if isinstance(self.factor, ScalarField):
            mult = self.factor.sample(x, y, t)
        else:
            mult = self.factor
        return vx * mult, vy * mult


class BlendVectorField(VectorField):
    """Blend two vector fields."""

    def __init__(
        self, field1: VectorField, field2: VectorField, alpha: float | ScalarField = 0.5
    ):
        """Initialize blend.

        Args:
            field1: First field
            field2: Second field
            alpha: Blend factor
        """
        self.field1 = field1
        self.field2 = field2
        self.alpha = alpha

    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> tuple:
        """Sample blended field."""
        vx1, vy1 = self.field1.sample(x, y, t)
        vx2, vy2 = self.field2.sample(x, y, t)

        if isinstance(self.alpha, ScalarField):
            a = self.alpha.sample(x, y, t)
        else:
            a = self.alpha

        return vx1 * (1.0 - a) + vx2 * a, vy1 * (1.0 - a) + vy2 * a
