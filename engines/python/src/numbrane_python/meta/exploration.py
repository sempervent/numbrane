"""Guided exploration strategies."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from numbrane_python.meta.fitness import FitnessFunction
from numbrane_python.meta.resolver import MetaResolver, ResolutionProvenance
from numbrane_python.params.schema import ParamSchema


@dataclass
class ExplorationStep:
    """A single exploration step."""

    config: dict[str, Any]
    param_hash: str
    score: float | None = None
    component_scores: dict[str, float] | None = None
    provenance: ResolutionProvenance | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ExplorationResult:
    """Result of an exploration run."""

    steps: list[ExplorationStep]
    best_step: ExplorationStep | None = None
    trajectory: list[tuple[float, float]] = field(default_factory=list)  # (step, score)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "num_steps": len(self.steps),
            "best_score": self.best_step.score if self.best_step else None,
            "trajectory": self.trajectory,
            "metadata": self.metadata,
        }


class ExplorationStrategy(ABC):
    """Base class for exploration strategies."""

    def __init__(self, seed: int = 42):
        """Initialize strategy.

        Args:
            seed: Random seed for determinism
        """
        self.seed = seed
        self.rng = np.random.default_rng(seed)

    @abstractmethod
    def generate_next(
        self,
        base_config: dict[str, Any],
        schema: ParamSchema,
        previous_steps: list[ExplorationStep],
        fitness: FitnessFunction | None = None,
    ) -> dict[str, Any]:
        """Generate next configuration to explore.

        Args:
            base_config: Base configuration
            schema: Parameter schema
            previous_steps: Previous exploration steps
            fitness: Optional fitness function

        Returns:
            Next configuration dictionary
        """
        pass


class RandomStrategy(ExplorationStrategy):
    """Random exploration (baseline)."""

    def generate_next(
        self,
        base_config: dict[str, Any],
        schema: ParamSchema,
        previous_steps: list[ExplorationStep],
        fitness: FitnessFunction | None = None,
    ) -> dict[str, Any]:
        """Generate random configuration."""
        # Sample from schema
        config = {}
        for param in schema.params:
            value = param.sample(self.rng)
            _set_nested(config, param.path, value)

        return config


class MetaGradientStrategy(ExplorationStrategy):
    """Meta-control gradient exploration."""

    def __init__(
        self,
        seed: int = 42,
        meta_targets: dict[str, float] | None = None,
        step_size: float = 0.1,
    ):
        """Initialize meta-gradient strategy.

        Args:
            seed: Random seed
            meta_targets: Target meta-control values
            step_size: Step size for gradient
        """
        super().__init__(seed)
        self.meta_targets = meta_targets or {}
        self.step_size = step_size
        self.resolver = MetaResolver()

    def generate_next(
        self,
        base_config: dict[str, Any],
        schema: ParamSchema,
        previous_steps: list[ExplorationStep],
        fitness: FitnessFunction | None = None,
    ) -> dict[str, Any]:
        """Generate next config using meta-gradient."""
        if not previous_steps:
            # First step: use targets directly
            current_meta = self.meta_targets.copy()
        else:
            # Gradient step: move toward targets
            last_step = previous_steps[-1]
            current_meta = {}

            for meta_name, target_value in self.meta_targets.items():
                # Get current value from last step's provenance
                if last_step.provenance:
                    last_meta = last_step.provenance.meta_controls.get(meta_name, 0.5)
                else:
                    last_meta = 0.5

                # Gradient step
                diff = target_value - last_meta
                current_meta[meta_name] = np.clip(last_meta + diff * self.step_size, 0.0, 1.0)

        # Resolve meta-controls
        resolved, provenance = self.resolver.resolve(base_config, current_meta, schema)
        return resolved


class EvolutionaryStrategy(ExplorationStrategy):
    """Evolutionary exploration."""

    def __init__(
        self,
        seed: int = 42,
        population_size: int = 10,
        mutation_rate: float = 0.1,
        crossover_rate: float = 0.5,
        selection_pressure: float = 0.5,
    ):
        """Initialize evolutionary strategy.

        Args:
            seed: Random seed
            population_size: Population size
            mutation_rate: Probability of mutation
            crossover_rate: Probability of crossover
            selection_pressure: Selection pressure (0.0 = random, 1.0 = elitist)
        """
        super().__init__(seed)
        self.population_size = population_size
        self.mutation_rate = mutation_rate
        self.crossover_rate = crossover_rate
        self.selection_pressure = selection_pressure
        self.resolver = MetaResolver()

    def generate_next(
        self,
        base_config: dict[str, Any],
        schema: ParamSchema,
        previous_steps: list[ExplorationStep],
        fitness: FitnessFunction | None = None,
    ) -> dict[str, Any]:
        """Generate next config using evolution."""
        if len(previous_steps) < self.population_size:
            # Initial population: random
            config = {}
            for param in schema.params:
                value = param.sample(self.rng)
                _set_nested(config, param.path, value)
            return config

        # Select parents (tournament selection)
        tournament_size = max(2, int(self.population_size * 0.2))
        candidates = self.rng.choice(len(previous_steps), tournament_size, replace=False)
        scored = [(previous_steps[i].score or 0.0, i) for i in candidates]
        scored.sort(reverse=True)
        parent1_idx = scored[0][1]
        parent2_idx = scored[1][1] if len(scored) > 1 else scored[0][1]

        parent1 = previous_steps[parent1_idx].config
        parent2 = previous_steps[parent2_idx].config

        # Crossover
        if self.rng.random() < self.crossover_rate:
            child = self._crossover(parent1, parent2, schema)
        else:
            child = parent1.copy()

        # Mutation
        if self.rng.random() < self.mutation_rate:
            child = self._mutate(child, schema)

        return child

    def _crossover(
        self, parent1: dict[str, Any], parent2: dict[str, Any], schema: ParamSchema
    ) -> dict[str, Any]:
        """Crossover two parents."""
        child = {}
        for param in schema.params:
            if self.rng.random() < 0.5:
                source = parent1
            else:
                source = parent2
            value = _get_nested(source, param.path)
            if value is not None:
                _set_nested(child, param.path, value)
        return child

    def _mutate(self, config: dict[str, Any], schema: ParamSchema) -> dict[str, Any]:
        """Mutate configuration."""
        mutated = config.copy()
        # Mutate random parameter
        param = self.rng.choice(schema.params)
        value = param.sample(self.rng)
        _set_nested(mutated, param.path, value)
        return mutated


class HumanInLoopStrategy(ExplorationStrategy):
    """Human-in-the-loop exploration (selection-based)."""

    def __init__(self, seed: int = 42, selections: list[int] | None = None):
        """Initialize human-in-loop strategy.

        Args:
            seed: Random seed
            selections: List of selected step indices (for replay)
        """
        super().__init__(seed)
        self.selections = selections or []
        self.selection_index = 0

    def generate_next(
        self,
        base_config: dict[str, Any],
        schema: ParamSchema,
        previous_steps: list[ExplorationStep],
        fitness: FitnessFunction | None = None,
    ) -> dict[str, Any]:
        """Generate next config based on human selections."""
        if not previous_steps:
            # First step: random
            config = {}
            for param in schema.params:
                value = param.sample(self.rng)
                _set_nested(config, param.path, value)
            return config

        # Use selection if available
        if self.selection_index < len(self.selections):
            selected_idx = self.selections[self.selection_index]
            self.selection_index += 1
            if 0 <= selected_idx < len(previous_steps):
                # Mutate selected config
                selected = previous_steps[selected_idx].config
                mutated = selected.copy()
                # Small mutation
                param = self.rng.choice(schema.params)
                value = param.sample(self.rng)
                _set_nested(mutated, param.path, value)
                return mutated

        # Default: mutate last step
        last = previous_steps[-1].config
        mutated = last.copy()
        param = self.rng.choice(schema.params)
        value = param.sample(self.rng)
        _set_nested(mutated, param.path, value)
        return mutated


def _set_nested(d: dict, path: str, value: Any) -> None:
    """Set nested value in dictionary."""
    parts = path.split(".")
    current = d
    for part in parts[:-1]:
        if part not in current:
            current[part] = {}
        current = current[part]
    current[parts[-1]] = value


def _get_nested(d: dict, path: str) -> Any:
    """Get nested value from dictionary."""
    parts = path.split(".")
    v = d
    for part in parts:
        if isinstance(v, dict):
            v = v.get(part)
        else:
            return None
    return v
