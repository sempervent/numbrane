"""Deterministic random number generation (numpy.random.Generator)."""

from __future__ import annotations

import numpy as np


class RNG:
    """Deterministic RNG wrapper around numpy.random.Generator."""

    def __init__(self, seed: int):
        """Initialize RNG with a seed.

        Args:
            seed: Integer seed for deterministic randomness
        """
        self._seed = seed
        self._generator = np.random.default_rng(seed)

    @property
    def seed(self) -> int:
        """Get the seed."""
        return self._seed

    @property
    def generator(self) -> np.random.Generator:
        """Get the numpy random generator."""
        return self._generator

    def fork(self, offset: int = 0) -> RNG:
        """Create a new RNG with seed offset (for frame-based randomness in animations).

        Args:
            offset: Offset to add to seed

        Returns:
            New RNG instance
        """
        return RNG(self._seed + offset)

    # Convenience methods
    def random(self, size=None):
        """Generate random floats in [0, 1)."""
        return self._generator.random(size)

    def uniform(self, low=0.0, high=1.0, size=None):
        """Generate uniform random floats."""
        return self._generator.uniform(low, high, size)

    def normal(self, loc=0.0, scale=1.0, size=None):
        """Generate normal random floats."""
        return self._generator.normal(loc, scale, size)

    def integers(self, low, high=None, size=None, endpoint=False):
        """Generate random integers."""
        return self._generator.integers(low, high, size, endpoint=endpoint)

    def choice(self, a, size=None, replace=True, p=None):
        """Generate random choice from array."""
        return self._generator.choice(a, size, replace, p)
