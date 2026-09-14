"""Extended parameter types with taxonomy support."""

import re
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any, Optional

import numpy as np

if TYPE_CHECKING:
    from numbrane_python.params.distributions import Distribution


class Param(ABC):
    """Base parameter type."""

    def __init__(
        self,
        name: str,
        default: Any,
        description: str | None = None,
        path: str | None = None,
        distribution: Optional["Distribution"] = None,
    ):
        """Initialize parameter.

        Args:
            name: Parameter name
            default: Default value
            description: Human-readable description
            path: Dot-separated path (e.g., "field.scale")
            distribution: Distribution for sampling
        """
        self.name = name
        self.default = default
        self.description = description or ""
        self.path = path or name
        self.distribution = distribution

    @abstractmethod
    def validate(self, value: Any) -> bool:
        """Validate a value."""
        pass

    @abstractmethod
    def sample(self, rng: np.random.Generator) -> Any:
        """Sample a value."""
        pass

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "name": self.name,
            "type": self.__class__.__name__,
            "path": self.path,
            "default": self.default,
            "description": self.description,
        }


class FloatParam(Param):
    """Float parameter."""

    def __init__(
        self,
        name: str,
        min_val: float,
        max_val: float,
        default: float,
        step: float | None = None,
        inclusive_min: bool = True,
        inclusive_max: bool = True,
        description: str | None = None,
        path: str | None = None,
        distribution: Optional["Distribution"] = None,
    ):
        """Initialize float parameter."""
        super().__init__(name, default, description, path, distribution)
        self.min_val = min_val
        self.max_val = max_val
        self.step = step
        self.inclusive_min = inclusive_min
        self.inclusive_max = inclusive_max

    def validate(self, value: Any) -> bool:
        """Validate float value."""
        try:
            fval = float(value)
            if self.step:
                # Check if value is on step grid
                remainder = (fval - self.min_val) % self.step
                if remainder > 1e-6 and (self.step - remainder) > 1e-6:
                    return False

            if self.inclusive_min:
                if fval < self.min_val:
                    return False
            else:
                if fval <= self.min_val:
                    return False

            if self.inclusive_max:
                if fval > self.max_val:
                    return False
            else:
                if fval >= self.max_val:
                    return False

            return True
        except (ValueError, TypeError):
            return False

    def sample(self, rng: np.random.Generator) -> float:
        """Sample float value."""
        if self.distribution:
            return self.distribution.sample(rng, self.min_val, self.max_val)
        else:
            value = rng.uniform(self.min_val, self.max_val)
            if self.step:
                value = round((value - self.min_val) / self.step) * self.step + self.min_val
            return float(np.clip(value, self.min_val, self.max_val))


class IntParam(Param):
    """Integer parameter."""

    def __init__(
        self,
        name: str,
        min_val: int,
        max_val: int,
        default: int,
        step: int = 1,
        description: str | None = None,
        path: str | None = None,
        distribution: Optional["Distribution"] = None,
    ):
        """Initialize integer parameter."""
        super().__init__(name, default, description, path, distribution)
        self.min_val = min_val
        self.max_val = max_val
        self.step = step

    def validate(self, value: Any) -> bool:
        """Validate integer value."""
        try:
            ival = int(value)
            if (ival - self.min_val) % self.step != 0:
                return False
            return self.min_val <= ival <= self.max_val
        except (ValueError, TypeError):
            return False

    def sample(self, rng: np.random.Generator) -> int:
        """Sample integer value."""
        if self.distribution:
            value = self.distribution.sample(rng, float(self.min_val), float(self.max_val))
            return int(value)
        else:
            choices = list(range(self.min_val, self.max_val + 1, self.step))
            return int(rng.choice(choices))


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
        """Initialize boolean parameter."""
        super().__init__(name, default, description, path)
        self.p_true = p_true

    def validate(self, value: Any) -> bool:
        """Validate boolean value."""
        return isinstance(value, bool)

    def sample(self, rng: np.random.Generator) -> bool:
        """Sample boolean value."""
        return rng.random() < self.p_true


class ChoiceParam(Param):
    """Choice/enum parameter."""

    def __init__(
        self,
        name: str,
        choices: list[Any],
        default: Any | None = None,
        weights: list[float] | None = None,
        description: str | None = None,
        path: str | None = None,
    ):
        """Initialize choice parameter."""
        if default is None:
            default = choices[0]
        super().__init__(name, default, description, path)
        self.choices = choices
        self.weights = weights
        if weights and len(weights) != len(choices):
            raise ValueError("Weights length must match choices")

    def validate(self, value: Any) -> bool:
        """Validate choice value."""
        return value in self.choices

    def sample(self, rng: np.random.Generator) -> Any:
        """Sample choice value."""
        if self.weights:
            return rng.choice(self.choices, p=self.weights)
        else:
            return rng.choice(self.choices)


class StringParam(Param):
    """String parameter with optional regex validation."""

    def __init__(
        self,
        name: str,
        default: str = "",
        pattern: str | None = None,
        min_length: int | None = None,
        max_length: int | None = None,
        description: str | None = None,
        path: str | None = None,
    ):
        """Initialize string parameter."""
        super().__init__(name, default, description, path)
        self.pattern = pattern
        self.min_length = min_length
        self.max_length = max_length
        if pattern:
            self.regex = re.compile(pattern)
        else:
            self.regex = None

    def validate(self, value: Any) -> bool:
        """Validate string value."""
        if not isinstance(value, str):
            return False
        if self.min_length and len(value) < self.min_length:
            return False
        if self.max_length and len(value) > self.max_length:
            return False
        if self.regex and not self.regex.match(value):
            return False
        return True

    def sample(self, rng: np.random.Generator) -> str:
        """Sample string value (returns default)."""
        return self.default


class ColorParam(Param):
    """Color parameter (palette name, hex, or RGB tuple)."""

    def __init__(
        self,
        name: str,
        default: str | tuple[int, int, int] | tuple[int, int, int, int] = "void",
        palette_names: list[str] | None = None,
        description: str | None = None,
        path: str | None = None,
    ):
        """Initialize color parameter."""
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

    def validate(self, value: Any) -> bool:
        """Validate color value."""
        if isinstance(value, str):
            return value in self.palette_names or bool(re.match(r"^#[0-9A-Fa-f]{6}$", value))
        elif isinstance(value, (tuple, list)):
            if len(value) in [3, 4]:
                return all(0 <= v <= 255 for v in value)
        return False

    def sample(self, rng: np.random.Generator) -> str:
        """Sample palette name."""
        return rng.choice(self.palette_names)


class Vec2Param(Param):
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

    def sample(self, rng: np.random.Generator) -> tuple[float, float]:
        """Sample 2D vector."""
        x = rng.uniform(self.min_val[0], self.max_val[0])
        y = rng.uniform(self.min_val[1], self.max_val[1])
        return (float(x), float(y))


class Vec3Param(Param):
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

    def sample(self, rng: np.random.Generator) -> tuple[float, float, float]:
        """Sample 3D vector."""
        x = rng.uniform(self.min_val[0], self.max_val[0])
        y = rng.uniform(self.min_val[1], self.max_val[1])
        z = rng.uniform(self.min_val[2], self.max_val[2])
        return (float(x), float(y), float(z))


class AngleParam(Param):
    """Angle parameter (degrees or radians)."""

    def __init__(
        self,
        name: str,
        min_angle: float = 0.0,
        max_angle: float = 360.0,
        default: float = 0.0,
        unit: str = "degrees",
        description: str | None = None,
        path: str | None = None,
    ):
        """Initialize angle parameter.

        Args:
            unit: "degrees" or "radians"
        """
        super().__init__(name, default, description, path)
        self.min_angle = min_angle
        self.max_angle = max_angle
        self.unit = unit

    def validate(self, value: Any) -> bool:
        """Validate angle value."""
        try:
            angle = float(value)
            return self.min_angle <= angle <= self.max_angle
        except (ValueError, TypeError):
            return False

    def sample(self, rng: np.random.Generator) -> float:
        """Sample angle value."""
        return float(rng.uniform(self.min_angle, self.max_angle))


class SeedParam(Param):
    """Seed parameter (explicit override)."""

    def __init__(
        self,
        name: str = "seed",
        default: int = 42,
        description: str | None = None,
        path: str | None = None,
    ):
        """Initialize seed parameter."""
        super().__init__(name, default, description, path)

    def validate(self, value: Any) -> bool:
        """Validate seed value."""
        try:
            return isinstance(int(value), int) and int(value) >= 0
        except (ValueError, TypeError):
            return False

    def sample(self, rng: np.random.Generator) -> int:
        """Sample seed value."""
        return int(rng.integers(0, 2**31))


class ImageSizeParam(Param):
    """Image size parameter (width/height or preset)."""

    PRESETS = {
        "hd": (1920, 1080),
        "4k": (3840, 2160),
        "square": (1080, 1080),
        "portrait": (1080, 1920),
        "small": (800, 600),
    }

    def __init__(
        self,
        name: str = "size",
        default: str | tuple[int, int] = "hd",
        description: str | None = None,
        path: str | None = None,
    ):
        """Initialize image size parameter."""
        super().__init__(name, default, description, path)

    def validate(self, value: Any) -> bool:
        """Validate size value."""
        if isinstance(value, str):
            return value in self.PRESETS
        elif isinstance(value, (tuple, list)) and len(value) == 2:
            return all(isinstance(v, int) and v > 0 for v in value)
        return False

    def sample(self, rng: np.random.Generator) -> str:
        """Sample preset name."""
        return rng.choice(list(self.PRESETS.keys()))

    def resolve(self, value: Any) -> tuple[int, int]:
        """Resolve to (width, height) tuple."""
        if isinstance(value, str):
            return self.PRESETS[value]
        else:
            return tuple(value)


class TimeParam(Param):
    """Time control parameter for animation."""

    def __init__(
        self,
        name: str,
        default: float = 0.0,
        min_time: float = 0.0,
        max_time: float = 10.0,
        description: str | None = None,
        path: str | None = None,
    ):
        """Initialize time parameter."""
        super().__init__(name, default, description, path)
        self.min_time = min_time
        self.max_time = max_time

    def validate(self, value: Any) -> bool:
        """Validate time value."""
        try:
            t = float(value)
            return self.min_time <= t <= self.max_time
        except (ValueError, TypeError):
            return False

    def sample(self, rng: np.random.Generator) -> float:
        """Sample time value."""
        return float(rng.uniform(self.min_time, self.max_time))


class ListParam(Param):
    """List parameter with element schema."""

    def __init__(
        self,
        name: str,
        element_param: Param,
        min_length: int = 0,
        max_length: int = 100,
        default: list[Any] | None = None,
        description: str | None = None,
        path: str | None = None,
    ):
        """Initialize list parameter."""
        super().__init__(name, default or [], description, path)
        self.element_param = element_param
        self.min_length = min_length
        self.max_length = max_length

    def validate(self, value: Any) -> bool:
        """Validate list value."""
        if not isinstance(value, list):
            return False
        if not (self.min_length <= len(value) <= self.max_length):
            return False
        return all(self.element_param.validate(v) for v in value)

    def sample(self, rng: np.random.Generator) -> list[Any]:
        """Sample list value."""
        length = rng.integers(self.min_length, self.max_length + 1)
        return [self.element_param.sample(rng) for _ in range(length)]


class TupleParam(Param):
    """Tuple parameter with element schemas."""

    def __init__(
        self,
        name: str,
        element_params: list[Param],
        default: tuple[Any, ...] | None = None,
        description: str | None = None,
        path: str | None = None,
    ):
        """Initialize tuple parameter."""
        if default is None:
            default = tuple(p.default for p in element_params)
        super().__init__(name, default, description, path)
        self.element_params = element_params

    def validate(self, value: Any) -> bool:
        """Validate tuple value."""
        if not isinstance(value, (tuple, list)):
            return False
        if len(value) != len(self.element_params):
            return False
        return all(p.validate(v) for p, v in zip(self.element_params, value))

    def sample(self, rng: np.random.Generator) -> tuple[Any, ...]:
        """Sample tuple value."""
        return tuple(p.sample(rng) for p in self.element_params)


class OneOfParam(Param):
    """One-of parameter (mutually exclusive choices)."""

    def __init__(
        self,
        name: str,
        choices: dict[str, dict[str, Param]],
        default: str | None = None,
        description: str | None = None,
        path: str | None = None,
    ):
        """Initialize one-of parameter.

        Args:
            choices: Dict mapping choice name to dict of params for that choice
        """
        if default is None:
            default = list(choices.keys())[0]
        super().__init__(name, default, description, path)
        self.choices = choices

    def validate(self, value: Any) -> bool:
        """Validate one-of value."""
        if isinstance(value, dict):
            # Check if exactly one choice key is present
            choice_keys = [k for k in self.choices.keys() if k in value]
            if len(choice_keys) != 1:
                return False
            choice = choice_keys[0]
            # Validate nested params
            for param_name, param in self.choices[choice].items():
                if param_name in value[choice]:
                    if not param.validate(value[choice][param_name]):
                        return False
            return True
        elif isinstance(value, str):
            return value in self.choices
        return False

    def sample(self, rng: np.random.Generator) -> dict[str, Any]:
        """Sample one-of value."""
        choice = rng.choice(list(self.choices.keys()))
        result = {choice: {name: param.sample(rng) for name, param in self.choices[choice].items()}}
        return result


class ObjectParam(Param):
    """Object/namespace parameter with nested params."""

    def __init__(
        self,
        name: str,
        params: list[Param],
        default: dict[str, Any] | None = None,
        description: str | None = None,
        path: str | None = None,
    ):
        """Initialize object parameter."""
        if default is None:
            default = {p.name: p.default for p in params}
        super().__init__(name, default, description, path)
        self.params = {p.name: p for p in params}

    def validate(self, value: Any) -> bool:
        """Validate object value."""
        if not isinstance(value, dict):
            return False
        for param_name, param in self.params.items():
            if param_name in value:
                if not param.validate(value[param_name]):
                    return False
        return True

    def sample(self, rng: np.random.Generator) -> dict[str, Any]:
        """Sample object value."""
        return {name: param.sample(rng) for name, param in self.params.items()}
