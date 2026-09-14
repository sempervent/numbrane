"""Parameter mutation strategies."""

from abc import ABC, abstractmethod
from typing import Any

import numpy as np

from numbrane_python.paramspace.param import ChoiceParam, FloatParam, IntParam
from numbrane_python.paramspace.space import ParamSpace


class Mutator(ABC):
    """Base class for parameter mutators."""

    @abstractmethod
    def mutate(
        self,
        space: ParamSpace,
        config: dict[str, Any],
        rng: np.random.Generator,
        mutation_rate: float = 0.1,
    ) -> dict[str, Any]:
        """Mutate a configuration.

        Args:
            space: Parameter space
            config: Configuration to mutate
            rng: Random number generator
            mutation_rate: Probability of mutating each parameter

        Returns:
            Mutated configuration
        """
        pass


class GaussianJitterMutator(Mutator):
    """Gaussian jitter mutation for continuous parameters."""

    def mutate(
        self,
        space: ParamSpace,
        config: dict[str, Any],
        rng: np.random.Generator,
        mutation_rate: float = 0.1,
    ) -> dict[str, Any]:
        """Apply Gaussian jitter mutation."""
        mutated = config.copy()

        for path, param in space.params.items():
            if rng.random() < mutation_rate:
                value = space._get_nested(config, path)
                if value is None:
                    continue

                if isinstance(param, FloatParam):
                    # Jitter within bounds
                    std = (param.max_val - param.min_val) * 0.1
                    jitter = rng.normal(0, std)
                    new_value = np.clip(value + jitter, param.min_val, param.max_val)
                    if param.decimals is not None:
                        new_value = round(new_value, param.decimals)
                    space._set_nested(mutated, path, float(new_value))
                elif isinstance(param, IntParam):
                    # Jitter integer
                    std = max(1, (param.max_val - param.min_val) * 0.1)
                    jitter = int(rng.normal(0, std))
                    new_value = np.clip(value + jitter, param.min_val, param.max_val)
                    space._set_nested(mutated, path, int(new_value))

        return mutated


class RandomResetMutator(Mutator):
    """Random reset mutation."""

    def mutate(
        self,
        space: ParamSpace,
        config: dict[str, Any],
        rng: np.random.Generator,
        mutation_rate: float = 0.1,
    ) -> dict[str, Any]:
        """Apply random reset mutation."""
        mutated = config.copy()

        for path, param in space.params.items():
            if rng.random() < mutation_rate:
                new_value = param.sample(rng)
                space._set_nested(mutated, path, new_value)

        return mutated


class SwapMutator(Mutator):
    """Swap mutation for choice parameters."""

    def mutate(
        self,
        space: ParamSpace,
        config: dict[str, Any],
        rng: np.random.Generator,
        mutation_rate: float = 0.1,
    ) -> dict[str, Any]:
        """Apply swap mutation."""
        mutated = config.copy()

        for path, param in space.params.items():
            if rng.random() < mutation_rate and isinstance(param, ChoiceParam):
                current_value = space._get_nested(config, path)
                if current_value in param.choices:
                    # Swap to different choice
                    other_choices = [c for c in param.choices if c != current_value]
                    if other_choices:
                        new_value = rng.choice(other_choices)
                        space._set_nested(mutated, path, new_value)

        return mutated


class CompositeMutator(Mutator):
    """Composite mutator applying multiple strategies."""

    def __init__(self, mutators: list[Mutator], weights: list[float] | None = None):
        """Initialize composite mutator.

        Args:
            mutators: List of mutators to apply
            weights: Optional weights for each mutator
        """
        self.mutators = mutators
        self.weights = weights or [1.0 / len(mutators)] * len(mutators)

    def mutate(
        self,
        space: ParamSpace,
        config: dict[str, Any],
        rng: np.random.Generator,
        mutation_rate: float = 0.1,
    ) -> dict[str, Any]:
        """Apply composite mutation."""
        # Choose mutator by weight
        mutator = rng.choice(self.mutators, p=self.weights)
        return mutator.mutate(space, config, rng, mutation_rate)
