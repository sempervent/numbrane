from numbrane_python.paramspace.param import FloatParam, IntParam, BoolParam, ChoiceParam, ColorParam, Vector2Param, Vector3Param
"""Parameter space samplers."""

from abc import ABC, abstractmethod
from typing import Any

import numpy as np

from numbrane_python.paramspace.constraint import ConstraintMode
from numbrane_python.paramspace.space import ParamSpace


class Sampler(ABC):
    """Base class for parameter space samplers."""

    @abstractmethod
    def sample(
        self,
        space: ParamSpace,
        n: int,
        seed: int,
        overrides: dict[str, Any] | None = None,
        constraint_mode: ConstraintMode = ConstraintMode.REJECT,
    ) -> list[tuple[dict[str, Any], dict[str, Any]]]:
        """Sample configurations from parameter space.

        Args:
            space: Parameter space
            n: Number of samples
            seed: Random seed
            overrides: Fixed parameter values
            constraint_mode: Constraint handling mode

        Returns:
            List of (config_dict, provenance_dict) tuples
        """
        pass


class RandomSampler(Sampler):
    """Random sampling."""

    def sample(
        self,
        space: ParamSpace,
        n: int,
        seed: int,
        overrides: dict[str, Any] | None = None,
        constraint_mode: ConstraintMode = ConstraintMode.REJECT,
    ) -> list[tuple[dict[str, Any], dict[str, Any]]]:
        """Random sampling."""
        rng = np.random.default_rng(seed)
        results = []

        for i in range(n):
            config, provenance = space.sample(rng, overrides, constraint_mode)
            provenance["sample_index"] = i
            provenance["sampler"] = "random"
            results.append((config, provenance))

        return results


class GridSampler(Sampler):
    """Grid sampling (warns on large spaces)."""

    def sample(
        self,
        space: ParamSpace,
        n: int,
        seed: int,
        overrides: dict[str, Any] | None = None,
        constraint_mode: ConstraintMode = ConstraintMode.REJECT,
    ) -> list[tuple[dict[str, Any], dict[str, Any]]]:
        """Grid sampling."""
        # Estimate grid size
        num_params = len([p for p in space.params.values() if p.path not in (overrides or {})])
        grid_size_per_dim = int(np.ceil(n ** (1.0 / num_params)))
        total_grid_points = grid_size_per_dim**num_params

        if total_grid_points > n * 10:
            import warnings

            warnings.warn(
                f"Grid sampling: {total_grid_points} points for {n} samples. Consider using LHS."
            )

        rng = np.random.default_rng(seed)
        results = []

        # Simple grid: divide each continuous param into grid_size_per_dim bins
        param_list = [p for p in space.params.values() if p.path not in (overrides or {})]

        for i in range(n):
            # Map i to grid coordinates
            config = {}
            provenance = {}

            for j, param in enumerate(param_list):
                # Calculate grid position
                grid_pos = (i // (grid_size_per_dim**j)) % grid_size_per_dim
                t = grid_pos / max(grid_size_per_dim - 1, 1)

                if isinstance(param, (FloatParam, Vector2Param, Vector3Param)):
                    if hasattr(param, "min_val") and hasattr(param, "max_val"):
                        if isinstance(param.min_val, (int, float)):
                            value = param.min_val + (param.max_val - param.min_val) * t
                        else:
                            # Vector - interpolate each component
                            value = tuple(
                                param.min_val[k] + (param.max_val[k] - param.min_val[k]) * t
                                for k in range(len(param.min_val))
                            )
                        config[param.path] = value
                        provenance[param.path] = f"grid({grid_pos}/{grid_size_per_dim})"
                elif isinstance(param, IntParam):
                    if hasattr(param, "min_val") and hasattr(param, "max_val"):
                        value = int(param.min_val + (param.max_val - param.min_val) * t)
                        config[param.path] = value
                        provenance[param.path] = f"grid({grid_pos}/{grid_size_per_dim})"
                else:
                    # For categorical, use random
                    value = param.sample(rng)
                    config[param.path] = value
                    provenance[param.path] = "random(categorical)"

            # Apply overrides
            if overrides:
                config.update(overrides)

            # Set nested and validate
            nested_config = space._set_nested_values(config)
            is_valid, errors = space.validate(nested_config)

            if is_valid or constraint_mode != ConstraintMode.REJECT:
                provenance["sample_index"] = i
                provenance["sampler"] = "grid"
                results.append((nested_config, provenance))

        return results


class LatinHypercubeSampler(Sampler):
    """Latin Hypercube Sampling (space-filling)."""

    def sample(
        self,
        space: ParamSpace,
        n: int,
        seed: int,
        overrides: dict[str, Any] | None = None,
        constraint_mode: ConstraintMode = ConstraintMode.REJECT,
    ) -> list[tuple[dict[str, Any], dict[str, Any]]]:
        """Latin Hypercube Sampling."""
        rng = np.random.default_rng(seed)

        # Get continuous parameters
        continuous_params = []
        categorical_params = []

        for param in space.params.values():
            if param.path in (overrides or {}):
                continue
            if isinstance(param, (FloatParam, IntParam, Vector2Param, Vector3Param)):
                continuous_params.append(param)
            else:
                categorical_params.append(param)

        # Generate LHS samples for continuous params
        num_continuous = len(continuous_params)
        if num_continuous > 0:
            # Create LHS matrix
            lhs = np.zeros((n, num_continuous))
            for j in range(num_continuous):
                # Permutation for this dimension
                perm = rng.permutation(n)
                # Random offsets
                offsets = rng.random(n)
                lhs[:, j] = (perm + offsets) / n
        else:
            lhs = np.zeros((n, 0))

        results = []
        overrides = overrides or {}

        for i in range(n):
            config = {}
            provenance = {}

            # Sample continuous params from LHS
            for j, param in enumerate(continuous_params):
                t = lhs[i, j]

                if isinstance(param, FloatParam):
                    value = param.min_val + (param.max_val - param.min_val) * t
                    if param.decimals is not None:
                        value = round(value, param.decimals)
                    config[param.path] = float(value)
                    provenance[param.path] = f"lhs({t:.3f})"
                elif isinstance(param, IntParam):
                    value = int(param.min_val + (param.max_val - param.min_val) * t)
                    config[param.path] = value
                    provenance[param.path] = f"lhs({t:.3f})"
                elif isinstance(param, Vector2Param):
                    value = (
                        param.min_val[0] + (param.max_val[0] - param.min_val[0]) * t,
                        param.min_val[1] + (param.max_val[1] - param.min_val[1]) * t,
                    )
                    config[param.path] = value
                    provenance[param.path] = f"lhs({t:.3f})"
                elif isinstance(param, Vector3Param):
                    value = (
                        param.min_val[0] + (param.max_val[0] - param.min_val[0]) * t,
                        param.min_val[1] + (param.max_val[1] - param.min_val[1]) * t,
                        param.min_val[2] + (param.max_val[2] - param.min_val[2]) * t,
                    )
                    config[param.path] = value
                    provenance[param.path] = f"lhs({t:.3f})"

            # Sample categorical params randomly
            for param in categorical_params:
                value = param.sample(rng)
                config[param.path] = value
                provenance[param.path] = "random(categorical)"

            # Apply overrides
            config.update(overrides)

            # Set nested and validate
            nested_config = space._set_nested_values(config)
            is_valid, errors = space.validate(nested_config)

            if is_valid or constraint_mode != ConstraintMode.REJECT:
                provenance["sample_index"] = i
                provenance["sampler"] = "lhs"
                results.append((nested_config, provenance))

        return results


class SobolSampler(Sampler):
    """Sobol sequence sampling (quasi-random, optional dependency)."""

    def sample(
        self,
        space: ParamSpace,
        n: int,
        seed: int,
        overrides: dict[str, Any] | None = None,
        constraint_mode: ConstraintMode = ConstraintMode.REJECT,
    ) -> list[tuple[dict[str, Any], dict[str, Any]]]:
        """Sobol sequence sampling."""
        # Try to use scipy if available, otherwise fall back to LHS
        try:
            from scipy.stats import qmc

            sobol = qmc.Sobol(
                d=len([p for p in space.params.values() if p.path not in (overrides or {})]),
                seed=seed,
            )
            sobol_samples = sobol.random(n)
        except ImportError:
            # Fall back to LHS
            import warnings

            warnings.warn("scipy not available, falling back to LHS for Sobol sampling")
            lhs_sampler = LatinHypercubeSampler()
            return lhs_sampler.sample(space, n, seed, overrides, constraint_mode)

        rng = np.random.default_rng(seed)
        results = []
        overrides = overrides or {}

        param_list = [p for p in space.params.values() if p.path not in overrides]
        continuous_params = [
            p
            for p in param_list
            if isinstance(p, (FloatParam, IntParam, Vector2Param, Vector3Param))
        ]
        categorical_params = [p for p in param_list if p not in continuous_params]

        for i in range(n):
            config = {}
            provenance = {}

            # Use Sobol for continuous
            for j, param in enumerate(continuous_params):
                if j < len(sobol_samples[i]):
                    t = sobol_samples[i, j]

                    if isinstance(param, FloatParam):
                        value = param.min_val + (param.max_val - param.min_val) * t
                        if param.decimals is not None:
                            value = round(value, param.decimals)
                        config[param.path] = float(value)
                        provenance[param.path] = f"sobol({t:.3f})"
                    elif isinstance(param, IntParam):
                        value = int(param.min_val + (param.max_val - param.min_val) * t)
                        config[param.path] = value
                        provenance[param.path] = f"sobol({t:.3f})"
                    # Vectors similar...

            # Random for categorical
            for param in categorical_params:
                value = param.sample(rng)
                config[param.path] = value
                provenance[param.path] = "random(categorical)"

            config.update(overrides)
            nested_config = space._set_nested_values(config)
            is_valid, errors = space.validate(nested_config)

            if is_valid or constraint_mode != ConstraintMode.REJECT:
                provenance["sample_index"] = i
                provenance["sampler"] = "sobol"
                results.append((nested_config, provenance))

        return results
