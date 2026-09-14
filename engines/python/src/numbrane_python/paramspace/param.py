"""Parameter type definitions."""

from abc import ABC, abstractmethod
from enum import Enum
from typing import Any

import numpy as np


class Distribution(Enum):
    """Distribution types for parameter sampling."""

    UNIFORM = "uniform"
    LOG_UNIFORM = "log_uniform"
    NORMAL = "normal"
    TRUNC_NORMAL = "trunc_normal"


class Param(ABC):
    """Base class for parameters."""

    def __init__(
        self,
        name: str,
        default: Any,
        description: str | None = None,
        path: str | None = None,
    ):
        """Initialize parameter.

        Args:
            name: Parameter name
            default: Default value
            description: Human-readable description
            path: Dot-separated path (e.g., "post.bloom.intensity")
        """
        self.name = name
        self.default = default
        self.description = description or ""
        self.path = path or name

    @abstractmethod
    def sample(self, rng: np.random.Generator) -> Any:
        """Sample a value from this parameter.

        Args:
            rng: Random number generator

        Returns:
            Sampled value
        """
        pass

    @abstractmethod
    def validate(self, value: Any) -> bool:
        """Validate a value.

        Args:
            value: Value to validate

        Returns:
            True if valid
        """
        pass

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation.

        Returns:
            Dictionary representation
        """
        return {
            "name": self.name,
            "type": self.__class__.__name__,
            "default": self.default,
            "description": self.description,
            "path": self.path,
        }


class FloatParam(Param):
    """Float parameter with range and distribution."""

    def __init__(
        self,
        name: str,
        min_val: float,
        max_val: float,
        default: float,
        distribution: Distribution = Distribution.UNIFORM,
        decimals: int | None = None,
        description: str | None = None,
        path: str | None = None,
    ):
        """Initialize float parameter.

        Args:
            name: Parameter name
            min_val: Minimum value
            max_val: Maximum value
            default: Default value
            distribution: Distribution type
            decimals: Number of decimal places (None = full precision)
            description: Description
            path: Dot-separated path
        """
        super().__init__(name, default, description, path)
        self.min_val = min_val
        self.max_val = max_val
        self.distribution = distribution
        self.decimals = decimals

        if not (min_val <= default <= max_val):
            raise ValueError(f"Default {default} not in range [{min_val}, {max_val}]")

    def sample(self, rng: np.random.Generator) -> float:
        """Sample a float value."""
        if self.distribution == Distribution.UNIFORM:
            value = rng.uniform(self.min_val, self.max_val)
        elif self.distribution == Distribution.LOG_UNIFORM:
            log_min = np.log(self.min_val + 1e-10)
            log_max = np.log(self.max_val + 1e-10)
            value = np.exp(rng.uniform(log_min, log_max))
        elif self.distribution == Distribution.NORMAL:
            # Use range to estimate mean/std
            mean = (self.min_val + self.max_val) / 2
            std = (self.max_val - self.min_val) / 6
            value = rng.normal(mean, std)
            value = np.clip(value, self.min_val, self.max_val)
        elif self.distribution == Distribution.TRUNC_NORMAL:
            mean = (self.min_val + self.max_val) / 2
            std = (self.max_val - self.min_val) / 6
            value = rng.normal(mean, std)
            value = np.clip(value, self.min_val, self.max_val)
        else:
            value = rng.uniform(self.min_val, self.max_val)

        if self.decimals is not None:
            value = round(value, self.decimals)

        return float(value)

    def validate(self, value: Any) -> bool:
        """Validate float value."""
        try:
            fval = float(value)
            return self.min_val <= fval <= self.max_val
        except (ValueError, TypeError):
            return False

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        d = super().to_dict()
        d.update(
            {
                "min": self.min_val,
                "max": self.max_val,
                "distribution": self.distribution.value,
                "decimals": self.decimals,
            }
        )
        return d


class IntParam(Param):
    """Integer parameter with range."""

    def __init__(
        self,
        name: str,
        min_val: int,
        max_val: int,
        default: int,
        distribution: Distribution = Distribution.UNIFORM,
        description: str | None = None,
        path: str | None = None,
    ):
        """Initialize integer parameter."""
        super().__init__(name, default, description, path)
        self.min_val = min_val
        self.max_val = max_val
        self.distribution = distribution

        if not (min_val <= default <= max_val):
            raise ValueError(f"Default {default} not in range [{min_val}, {max_val}]")

    def sample(self, rng: np.random.Generator) -> int:
        """Sample an integer value."""
        if self.distribution == Distribution.UNIFORM:
            return int(rng.integers(self.min_val, self.max_val + 1))
        elif self.distribution == Distribution.LOG_UNIFORM:
            log_min = np.log(self.min_val + 1)
            log_max = np.log(self.max_val + 1)
            value = int(np.exp(rng.uniform(log_min, log_max)))
            return np.clip(value, self.min_val, self.max_val)
        else:
            return int(rng.integers(self.min_val, self.max_val + 1))

    def validate(self, value: Any) -> bool:
        """Validate integer value."""
        try:
            ival = int(value)
            return self.min_val <= ival <= self.max_val
        except (ValueError, TypeError):
            return False

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        d = super().to_dict()
        d.update(
            {
                "min": self.min_val,
                "max": self.max_val,
                "distribution": self.distribution.value,
            }
        )
        return d


class BoolParam(Param):
    """Boolean parameter."""

    def __init__(
        self,
        name: str,
        default: bool = False,
        p_true: float = 0.5,
        description: str | None = None,
        path: str | None = None,
    ):
        """Initialize boolean parameter.

        Args:
            name: Parameter name
            default: Default value
            p_true: Probability of True when sampling
            description: Description
            path: Dot-separated path
        """
        super().__init__(name, default, description, path)
        self.p_true = p_true

    def sample(self, rng: np.random.Generator) -> bool:
        """Sample a boolean value."""
        return rng.random() < self.p_true

    def validate(self, value: Any) -> bool:
        """Validate boolean value."""
        return isinstance(value, bool)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        d = super().to_dict()
        d["p_true"] = self.p_true
        return d


class ChoiceParam(Param):
    """Categorical choice parameter."""

    def __init__(
        self,
        name: str,
        choices: list[Any],
        default: Any | None = None,
        weights: list[float] | None = None,
        description: str | None = None,
        path: str | None = None,
    ):
        """Initialize choice parameter.

        Args:
            name: Parameter name
            choices: List of possible values
            default: Default value (if None, uses first choice)
            weights: Optional weights for sampling (must sum to 1)
            description: Description
            path: Dot-separated path
        """
        if default is None:
            default = choices[0]
        if default not in choices:
            raise ValueError(f"Default {default} not in choices")

        super().__init__(name, default, description, path)
        self.choices = choices
        self.weights = weights

        if weights and len(weights) != len(choices):
            raise ValueError("Weights length must match choices length")
        if weights and abs(sum(weights) - 1.0) > 1e-6:
            raise ValueError("Weights must sum to 1.0")

    def sample(self, rng: np.random.Generator) -> Any:
        """Sample a choice."""
        if self.weights:
            return rng.choice(self.choices, p=self.weights)
        else:
            return rng.choice(self.choices)

    def validate(self, value: Any) -> bool:
        """Validate choice value."""
        return value in self.choices

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        d = super().to_dict()
        d["choices"] = self.choices
        d["weights"] = self.weights
        return d


class ColorParam(Param):
    """Color parameter (palette name or explicit color)."""

    def __init__(
        self,
        name: str,
        default: str | tuple[int, int, int] | tuple[int, int, int, int] = "void",
        palette_names: list[str] | None = None,
        description: str | None = None,
        path: str | None = None,
    ):
        """Initialize color parameter.

        Args:
            name: Parameter name
            default: Default value (palette name or RGB/RGBA tuple)
            palette_names: List of available palette names
            description: Description
            path: Dot-separated path
        """
        super().__init__(name, default, description, path)
        self.palette_names = palette_names or [
            "void",
            "sunset",
            "ocean",
            "forest",
            "fire",
            "ice",
            "neon",
            "earth",
            "aurora",
            "cosmic",
        ]

    def sample(self, rng: np.random.Generator) -> str:
        """Sample a palette name."""
        return rng.choice(self.palette_names)

    def validate(self, value: Any) -> bool:
        """Validate color value."""
        if isinstance(value, str):
            return value in self.palette_names
        elif isinstance(value, (tuple, list)):
            if len(value) in [3, 4]:
                return all(0 <= v <= 255 for v in value)
        return False

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        d = super().to_dict()
        d["palette_names"] = self.palette_names
        return d


class SeedParam(Param):
    """Special seed parameter (derived from main seed)."""

    def __init__(
        self,
        name: str = "seed",
        default: int = 42,
        description: str | None = None,
        path: str | None = None,
    ):
        """Initialize seed parameter."""
        super().__init__(name, default, description, path)

    def sample(self, rng: np.random.Generator) -> int:
        """Sample a seed (derived from main seed)."""
        return int(rng.integers(0, 2**31))

    def validate(self, value: Any) -> bool:
        """Validate seed value."""
        try:
            return isinstance(int(value), int) and int(value) >= 0
        except (ValueError, TypeError):
            return False


class Vector2Param(Param):
    """2D vector parameter."""

    def __init__(
        self,
        name: str,
        min_val: tuple[float, float],
        max_val: tuple[float, float],
        default: tuple[float, float],
        description: str | None = None,
        path: str | None = None,
    ):
        """Initialize 2D vector parameter."""
        super().__init__(name, default, description, path)
        self.min_val = min_val
        self.max_val = max_val

    def sample(self, rng: np.random.Generator) -> tuple[float, float]:
        """Sample a 2D vector."""
        x = rng.uniform(self.min_val[0], self.max_val[0])
        y = rng.uniform(self.min_val[1], self.max_val[1])
        return (float(x), float(y))

    def validate(self, value: Any) -> bool:
        """Validate vector value."""
        try:
            if isinstance(value, (tuple, list)) and len(value) == 2:
                x, y = float(value[0]), float(value[1])
                return (
                    self.min_val[0] <= x <= self.max_val[0]
                    and self.min_val[1] <= y <= self.max_val[1]
                )
        except (ValueError, TypeError):
            pass
        return False

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        d = super().to_dict()
        d.update(
            {
                "min": self.min_val,
                "max": self.max_val,
            }
        )
        return d


class Vector3Param(Param):
    """3D vector parameter."""

    def __init__(
        self,
        name: str,
        min_val: tuple[float, float, float],
        max_val: tuple[float, float, float],
        default: tuple[float, float, float],
        description: str | None = None,
        path: str | None = None,
    ):
        """Initialize 3D vector parameter."""
        super().__init__(name, default, description, path)
        self.min_val = min_val
        self.max_val = max_val

    def sample(self, rng: np.random.Generator) -> tuple[float, float, float]:
        """Sample a 3D vector."""
        x = rng.uniform(self.min_val[0], self.max_val[0])
        y = rng.uniform(self.min_val[1], self.max_val[1])
        z = rng.uniform(self.min_val[2], self.max_val[2])
        return (float(x), float(y), float(z))

    def validate(self, value: Any) -> bool:
        """Validate vector value."""
        try:
            if isinstance(value, (tuple, list)) and len(value) == 3:
                x, y, z = float(value[0]), float(value[1]), float(value[2])
                return (
                    self.min_val[0] <= x <= self.max_val[0]
                    and self.min_val[1] <= y <= self.max_val[1]
                    and self.min_val[2] <= z <= self.max_val[2]
                )
        except (ValueError, TypeError):
            pass
        return False

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        d = super().to_dict()
        d.update(
            {
                "min": self.min_val,
                "max": self.max_val,
            }
        )
        return d
