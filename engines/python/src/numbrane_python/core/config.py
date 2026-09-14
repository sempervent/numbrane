"""Configuration system with Pydantic models."""

import json
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field, field_validator


class Quality(BaseModel):
    """Rendering quality settings."""

    mode: str = Field(default="preview", description="preview or final")
    supersample: int = Field(default=1, description="Supersampling factor (1, 2, or 4)")

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v):
        if v not in ["preview", "final"]:
            raise ValueError("mode must be 'preview' or 'final'")
        return v

    @field_validator("supersample")
    @classmethod
    def validate_supersample(cls, v):
        if v not in [1, 2, 4]:
            raise ValueError("supersample must be 1, 2, or 4")
        return v


def load_config(path: Path) -> dict[str, Any]:
    """Load config from YAML or JSON file.

    Args:
        path: Path to config file

    Returns:
        Dictionary of config values
    """
    with open(path) as f:
        if path.suffix in [".yaml", ".yml"]:
            return yaml.safe_load(f)
        else:
            return json.load(f)


def save_config(config: BaseModel, path: Path) -> None:
    """Save config to JSON file.

    Args:
        config: Pydantic model instance
        path: Path to save to
    """
    with open(path, "w") as f:
        json.dump(config.model_dump(), f, indent=2)


def sample_range(value: float | tuple[float, float], rng: Any) -> float:
    """Sample a value from a range if it's a tuple, otherwise return the value.

    Args:
        value: Either a single value or (min, max) tuple
        rng: Random number generator

    Returns:
        Sampled value
    """
    if isinstance(value, tuple):
        return rng.uniform(value[0], value[1])
    return value
