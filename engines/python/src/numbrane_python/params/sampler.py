"""Parameter sampling strategies."""

from abc import ABC, abstractmethod
from typing import Any

import numpy as np

from numbrane_python.params.schema import ParamSchema
from numbrane_python.params.types import FloatParam, IntParam


class Sampler(ABC):
    """Base sampler class."""

    @abstractmethod
    def sample(
        self,
        schema: ParamSchema,
        n: int,
        seed: int,
        overrides: dict[str, Any] | None = None,
    ) -> list[tuple[dict[str, Any], dict[str, Any]]]:
        """Sample configurations.

        Args:
            schema: Parameter schema
            n: Number of samples
            seed: Random seed
            overrides: Fixed parameter values

        Returns:
            List of (config_dict, provenance_dict) tuples
        """
        pass


class RandomSampler(Sampler):
    """Random sampling."""

    def sample(
        self,
        schema: ParamSchema,
        n: int,
        seed: int,
        overrides: dict[str, Any] | None = None,
    ) -> list[tuple[dict[str, Any], dict[str, Any]]]:
        """Random sampling."""
        rng = np.random.default_rng(seed)
        results = []
        overrides = overrides or {}

        for i in range(n):
            config = {}
            provenance = {}

            for param in schema.params:
                if param.path in overrides:
                    config[param.path] = overrides[param.path]
                    provenance[param.path] = "override"
                else:
                    value = param.sample(rng)
                    _set_nested(config, param.path, value)
                    provenance[param.path] = "random"

            results.append((config, provenance))

        return results


class LatinHypercubeSampler(Sampler):
    """Latin Hypercube Sampling."""

    def sample(
        self,
        schema: ParamSchema,
        n: int,
        seed: int,
        overrides: dict[str, Any] | None = None,
    ) -> list[tuple[dict[str, Any], dict[str, Any]]]:
        """Latin Hypercube Sampling."""
        rng = np.random.default_rng(seed)
        overrides = overrides or {}

        # Get continuous parameters
        continuous_params = []
        categorical_params = []

        for param in schema.params:
            if param.path in overrides:
                continue
            if isinstance(param, (FloatParam, IntParam)):
                continuous_params.append(param)
            else:
                categorical_params.append(param)

        # Generate LHS matrix
        num_continuous = len(continuous_params)
        if num_continuous > 0:
            lhs = np.zeros((n, num_continuous))
            for j in range(num_continuous):
                perm = rng.permutation(n)
                offsets = rng.random(n)
                lhs[:, j] = (perm + offsets) / n
        else:
            lhs = np.zeros((n, 0))

        results = []

        for i in range(n):
            config = {}
            provenance = {}

            # Sample continuous from LHS
            for j, param in enumerate(continuous_params):
                if j < lhs.shape[1]:
                    t = lhs[i, j]
                    if isinstance(param, FloatParam):
                        value = param.min_val + (param.max_val - param.min_val) * t
                        if param.decimals is not None:
                            value = round(value, param.decimals)
                        _set_nested(config, param.path, float(value))
                        provenance[param.path] = f"lhs({t:.3f})"
                    elif isinstance(param, IntParam):
                        value = int(param.min_val + (param.max_val - param.min_val) * t)
                        _set_nested(config, param.path, value)
                        provenance[param.path] = f"lhs({t:.3f})"

            # Sample categorical randomly
            for param in categorical_params:
                value = param.sample(rng)
                _set_nested(config, param.path, value)
                provenance[param.path] = "random"

            # Apply overrides
            for path, value in overrides.items():
                _set_nested(config, path, value)
                provenance[path] = "override"

            results.append((config, provenance))

        return results


def _set_nested(d: dict, path: str, value: Any) -> None:
    """Set nested value in dictionary."""
    parts = path.split(".")
    current = d
    for part in parts[:-1]:
        if part not in current:
            current[part] = {}
        current = current[part]
    current[parts[-1]] = value
