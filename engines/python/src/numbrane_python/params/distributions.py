"""Deterministic distributions for parameter sampling."""

from abc import ABC, abstractmethod
from typing import Any

import numpy as np


class Distribution(ABC):
    """Base distribution class."""

    @abstractmethod
    def sample(self, rng: np.random.Generator, min_val: float, max_val: float) -> float:
        """Sample a value in the given range."""
        pass


class Uniform(Distribution):
    """Uniform distribution."""

    def sample(self, rng: np.random.Generator, min_val: float, max_val: float) -> float:
        """Sample uniform value."""
        return float(rng.uniform(min_val, max_val))


class LogUniform(Distribution):
    """Log-uniform distribution."""

    def sample(self, rng: np.random.Generator, min_val: float, max_val: float) -> float:
        """Sample log-uniform value."""
        log_min = np.log(max(min_val, 1e-10))
        log_max = np.log(max(max_val, 1e-10))
        return float(np.exp(rng.uniform(log_min, log_max)))


class Normal(Distribution):
    """Normal distribution (truncated to range)."""

    def __init__(self, mu: float | None = None, sigma: float | None = None):
        """Initialize normal distribution.

        Args:
            mu: Mean (if None, uses midpoint of range)
            sigma: Standard deviation (if None, uses 1/6 of range)
        """
        self.mu = mu
        self.sigma = sigma

    def sample(self, rng: np.random.Generator, min_val: float, max_val: float) -> float:
        """Sample normal value (truncated)."""
        mu = self.mu if self.mu is not None else (min_val + max_val) / 2
        sigma = self.sigma if self.sigma is not None else (max_val - min_val) / 6

        # Box-Muller for deterministic sampling
        u1 = rng.random()
        u2 = rng.random()
        z = np.sqrt(-2 * np.log(u1 + 1e-10)) * np.cos(2 * np.pi * u2)
        value = mu + sigma * z

        return float(np.clip(value, min_val, max_val))


class DiscreteWeighted(Distribution):
    """Discrete weighted distribution."""

    def __init__(self, weights: dict[Any, float]):
        """Initialize weighted distribution.

        Args:
            weights: Dict mapping values to weights
        """
        self.weights = weights
        self.values = list(weights.keys())
        self.probs = np.array(list(weights.values()))
        self.probs = self.probs / self.probs.sum()

    def sample(self, rng: np.random.Generator, min_val: float, max_val: float) -> float:
        """Sample weighted value."""
        return float(rng.choice(self.values, p=self.probs))


class Grid(Distribution):
    """Grid distribution (discrete values)."""

    def __init__(self, values: list[float]):
        """Initialize grid distribution.

        Args:
            values: List of discrete values
        """
        self.values = values

    def sample(self, rng: np.random.Generator, min_val: float, max_val: float) -> float:
        """Sample grid value."""
        valid_values = [v for v in self.values if min_val <= v <= max_val]
        if not valid_values:
            return float(rng.uniform(min_val, max_val))
        return float(rng.choice(valid_values))
