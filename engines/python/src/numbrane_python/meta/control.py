"""Meta-control definitions and mappings."""

from collections.abc import Callable
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import numpy as np


class MappingCurve(str, Enum):
    """Curve types for parameter mapping."""

    LINEAR = "linear"
    QUADRATIC = "quadratic"
    LOGARITHMIC = "logarithmic"
    EXPONENTIAL = "exponential"
    SIGMOID = "sigmoid"
    INVERSE = "inverse"


@dataclass
class MappingRule:
    """Rule for mapping a meta-control value to a parameter."""

    param_path: str  # Taxonomy path (e.g., "field.scale")
    curve: MappingCurve = MappingCurve.LINEAR
    scale: float = 1.0  # Multiplier
    offset: float = 0.0  # Base offset
    min_value: float | None = None  # Override param min
    max_value: float | None = None  # Override param max
    invert: bool = False  # Invert the mapping (1.0 - value)
    condition: Callable[[dict[str, Any]], bool] | None = None  # Conditional application

    def apply(
        self,
        meta_value: float,
        param_min: float,
        param_max: float,
        context: dict[str, Any] | None = None,
    ) -> float:
        """Apply mapping rule to get parameter value.

        Args:
            meta_value: Meta-control value [0.0, 1.0]
            param_min: Parameter minimum
            param_max: Parameter maximum
            context: Optional context for conditional rules

        Returns:
            Mapped parameter value
        """
        # Check condition
        if self.condition and context:
            if not self.condition(context):
                return None  # Skip this rule

        # Invert if needed
        v = 1.0 - meta_value if self.invert else meta_value

        # Apply curve
        if self.curve == MappingCurve.LINEAR:
            mapped = v
        elif self.curve == MappingCurve.QUADRATIC:
            mapped = v**2
        elif self.curve == MappingCurve.LOGARITHMIC:
            mapped = np.log1p(v * 9) / np.log(10)  # Map [0,1] to [0,1] via log
        elif self.curve == MappingCurve.EXPONENTIAL:
            mapped = (np.exp(v * 2) - 1) / (np.exp(2) - 1)  # Map [0,1] to [0,1] via exp
        elif self.curve == MappingCurve.SIGMOID:
            mapped = 1.0 / (1.0 + np.exp(-10 * (v - 0.5)))  # Sigmoid centered at 0.5
        elif self.curve == MappingCurve.INVERSE:
            mapped = 1.0 - v
        else:
            mapped = v

        # Scale and offset
        value = mapped * self.scale + self.offset

        # Map to parameter range
        param_min_use = self.min_value if self.min_value is not None else param_min
        param_max_use = self.max_value if self.max_value is not None else param_max

        result = param_min_use + value * (param_max_use - param_min_use)

        # Clamp to bounds
        return np.clip(result, param_min, param_max)


@dataclass
class MetaMapping:
    """Mapping from meta-control to parameters."""

    rules: list[MappingRule] = field(default_factory=list)
    priority: int = 0  # Higher priority rules override lower priority

    def add_rule(self, rule: MappingRule) -> None:
        """Add a mapping rule."""
        self.rules.append(rule)

    def apply(
        self,
        meta_value: float,
        schema: Any,
        base_config: dict[str, Any],
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Apply mapping to generate parameter changes.

        Args:
            meta_value: Meta-control value [0.0, 1.0]
            schema: Parameter schema
            base_config: Base configuration
            context: Optional context

        Returns:
            Dictionary of parameter changes
        """
        changes = {}

        # Get parameter info from schema
        param_info = {}
        if hasattr(schema, "params"):
            for param in schema.params:
                if hasattr(param, "min_val") and hasattr(param, "max_val"):
                    param_info[param.path] = {
                        "min": param.min_val,
                        "max": param.max_val,
                    }

        # Apply rules in priority order
        sorted_rules = sorted(self.rules, key=lambda r: r.priority, reverse=True)

        for rule in sorted_rules:
            if rule.param_path in param_info:
                param_min = param_info[rule.param_path]["min"]
                param_max = param_info[rule.param_path]["max"]

                value = rule.apply(meta_value, param_min, param_max, context)
                if value is not None:
                    changes[rule.param_path] = value

        return changes


@dataclass
class MetaControl:
    """A meta-control (high-level aesthetic parameter)."""

    name: str
    description: str
    default: float = 0.5
    mapping: MetaMapping | None = None

    def __post_init__(self):
        """Initialize mapping if not provided."""
        if self.mapping is None:
            self.mapping = MetaMapping()


def create_meta_controls() -> dict[str, MetaControl]:
    """Create all standard meta-controls."""

    controls = {}

    # VIOLENCE - aggression, intensity, chaos
    violence = MetaControl(
        name="violence",
        description="Aggression, intensity, and chaotic energy",
        default=0.5,
    )
    violence.mapping.add_rule(
        MappingRule("field.strength", MappingCurve.QUADRATIC, scale=1.0, priority=10)
    )
    violence.mapping.add_rule(
        MappingRule("sim.branching.probability", MappingCurve.LINEAR, scale=1.0, priority=10)
    )
    violence.mapping.add_rule(MappingRule("sim.count", MappingCurve.LINEAR, scale=0.5, priority=9))
    violence.mapping.add_rule(
        MappingRule("post.bloom.intensity", MappingCurve.QUADRATIC, scale=1.0, priority=8)
    )
    violence.mapping.add_rule(
        MappingRule("field.octaves", MappingCurve.LOGARITHMIC, scale=0.3, priority=7)
    )
    violence.mapping.add_rule(
        MappingRule("geom.stroke.width", MappingCurve.LINEAR, scale=0.5, priority=6)
    )
    controls["violence"] = violence

    # ENTROPY - randomness, disorder, unpredictability
    entropy = MetaControl(
        name="entropy",
        description="Randomness, disorder, and unpredictability",
        default=0.5,
    )
    entropy.mapping.add_rule(
        MappingRule("geom.stroke.jitter", MappingCurve.QUADRATIC, scale=1.0, priority=10)
    )
    entropy.mapping.add_rule(
        MappingRule("field.octaves", MappingCurve.LINEAR, scale=0.5, priority=9)
    )
    entropy.mapping.add_rule(
        MappingRule("field.warp.strength", MappingCurve.LINEAR, scale=1.0, priority=9)
    )
    entropy.mapping.add_rule(
        MappingRule("sim.branching.probability", MappingCurve.LINEAR, scale=0.5, priority=8)
    )
    entropy.mapping.add_rule(
        MappingRule("composition.perturbation", MappingCurve.QUADRATIC, scale=1.0, priority=8)
    )
    entropy.mapping.add_rule(MappingRule("sim.dt", MappingCurve.LINEAR, scale=0.3, priority=7))
    controls["entropy"] = entropy

    # SYMMETRY - order, balance, structure
    symmetry = MetaControl(
        name="symmetry",
        description="Order, balance, and structural harmony",
        default=0.5,
    )
    symmetry.mapping.add_rule(
        MappingRule("composition.symmetry.radial", MappingCurve.SIGMOID, scale=1.0, priority=10)
    )
    symmetry.mapping.add_rule(
        MappingRule("composition.symmetry.fold_count", MappingCurve.LINEAR, scale=0.5, priority=9)
    )
    symmetry.mapping.add_rule(
        MappingRule("geom.stroke.jitter", MappingCurve.INVERSE, scale=1.0, priority=10)
    )
    symmetry.mapping.add_rule(
        MappingRule("field.warp.strength", MappingCurve.INVERSE, scale=1.0, priority=9)
    )
    symmetry.mapping.add_rule(
        MappingRule("composition.perturbation", MappingCurve.INVERSE, scale=1.0, priority=8)
    )
    controls["symmetry"] = symmetry

    # BIOLOGICALNESS - organic, growth, life-like
    biologicalness = MetaControl(
        name="biologicalness",
        description="Organic, growth-like, and life-like qualities",
        default=0.5,
    )
    biologicalness.mapping.add_rule(
        MappingRule("sim.growth.rate", MappingCurve.LINEAR, scale=1.0, priority=10)
    )
    biologicalness.mapping.add_rule(
        MappingRule("geom.stroke.taper", MappingCurve.QUADRATIC, scale=1.0, priority=10)
    )
    biologicalness.mapping.add_rule(
        MappingRule("sim.branching.probability", MappingCurve.LINEAR, scale=0.7, priority=9)
    )
    biologicalness.mapping.add_rule(
        MappingRule("sim.growth.branch_angle", MappingCurve.LINEAR, scale=0.5, priority=8)
    )
    biologicalness.mapping.add_rule(
        MappingRule("color.palette", MappingCurve.LINEAR, scale=1.0, priority=7)
    )  # Prefer earth/forest
    controls["biologicalness"] = biologicalness

    # RIGIDITY - geometric, hard edges, structure
    rigidity = MetaControl(
        name="rigidity",
        description="Geometric, hard-edged, and structural qualities",
        default=0.5,
    )
    rigidity.mapping.add_rule(
        MappingRule("geom.sdf.smoothness", MappingCurve.INVERSE, scale=1.0, priority=10)
    )
    rigidity.mapping.add_rule(
        MappingRule(
            "composition.constraints.strictness", MappingCurve.LINEAR, scale=1.0, priority=10
        )
    )
    rigidity.mapping.add_rule(
        MappingRule("geom.stroke.jitter", MappingCurve.INVERSE, scale=1.0, priority=9)
    )
    rigidity.mapping.add_rule(
        MappingRule("field.warp.strength", MappingCurve.INVERSE, scale=1.0, priority=8)
    )
    rigidity.mapping.add_rule(
        MappingRule("geom.stroke.taper", MappingCurve.INVERSE, scale=1.0, priority=7)
    )
    controls["rigidity"] = rigidity

    # COSMICNESS - space, depth, vastness
    cosmicness = MetaControl(
        name="cosmicness",
        description="Space-like, deep, and vast qualities",
        default=0.5,
    )
    cosmicness.mapping.add_rule(
        MappingRule("field.scale", MappingCurve.INVERSE, scale=0.5, priority=10)
    )  # Large scale
    cosmicness.mapping.add_rule(
        MappingRule("post.bloom.intensity", MappingCurve.QUADRATIC, scale=1.0, priority=10)
    )
    cosmicness.mapping.add_rule(
        MappingRule("composition.stars.density", MappingCurve.LINEAR, scale=1.0, priority=9)
    )
    cosmicness.mapping.add_rule(
        MappingRule("post.bloom.threshold", MappingCurve.INVERSE, scale=1.0, priority=8)
    )
    cosmicness.mapping.add_rule(
        MappingRule("color.palette", MappingCurve.LINEAR, scale=1.0, priority=7)
    )  # Prefer cosmic/void
    controls["cosmicness"] = cosmicness

    # WEIRDNESS - unexpected combinations, mashups
    weirdness = MetaControl(
        name="weirdness",
        description="Unexpected combinations and cross-system couplings",
        default=0.5,
    )
    weirdness.mapping.add_rule(
        MappingRule(
            "composition.venation.breakthrough_prob", MappingCurve.QUADRATIC, scale=1.0, priority=10
        )
    )
    weirdness.mapping.add_rule(
        MappingRule("composition.trail_to_lighting", MappingCurve.SIGMOID, scale=1.0, priority=9)
    )
    weirdness.mapping.add_rule(
        MappingRule(
            "composition.constraints.rejection_mode", MappingCurve.LINEAR, scale=1.0, priority=8
        )
    )
    weirdness.mapping.add_rule(
        MappingRule("field.warp.strength", MappingCurve.QUADRATIC, scale=1.0, priority=7)
    )
    weirdness.mapping.add_rule(
        MappingRule("sim.branching.probability", MappingCurve.QUADRATIC, scale=0.5, priority=6)
    )
    controls["weirdness"] = weirdness

    return controls


# Global registry
_meta_controls = None


def get_meta_controls() -> dict[str, MetaControl]:
    """Get all registered meta-controls."""
    global _meta_controls
    if _meta_controls is None:
        _meta_controls = create_meta_controls()
    return _meta_controls


def get_meta_control(name: str) -> MetaControl | None:
    """Get a specific meta-control by name."""
    controls = get_meta_controls()
    return controls.get(name)
