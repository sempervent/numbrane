"""Parameter space definition and operations."""

from typing import Any

import numpy as np

from numbrane_python.paramspace.condition import Condition
from numbrane_python.paramspace.constraint import Constraint, ConstraintMode
from numbrane_python.paramspace.param import (
    BoolParam,
    ChoiceParam,
    ColorParam,
    FloatParam,
    IntParam,
    Param,
    Vector2Param,
    Vector3Param,
)


class ParamSpace:
    """Parameter space with validation, sampling, and constraints."""

    def __init__(
        self,
        params: list[Param],
        conditions: list[Condition] | None = None,
        constraints: list[Constraint] | None = None,
    ):
        """Initialize parameter space.

        Args:
            params: List of parameters
            conditions: List of conditions
            constraints: List of constraints
        """
        self.params = {p.path: p for p in params}
        self.conditions = conditions or []
        self.constraints = constraints or []

    def validate(self, config: dict[str, Any]) -> tuple[bool, list[str]]:
        """Validate a configuration.

        Args:
            config: Configuration dictionary

        Returns:
            Tuple of (is_valid, error_messages)
        """
        errors = []

        # Validate individual parameters
        for path, param in self.params.items():
            value = self._get_nested(config, path)
            if value is not None and not param.validate(value):
                errors.append(f"{path}: invalid value {value}")

        # Evaluate conditions
        active_params = set()
        for condition in self.conditions:
            if condition.evaluate(config):
                active_params.update(condition.activate_params)
                for deactivate in condition.deactivate_params:
                    active_params.discard(deactivate)

        # Validate constraints
        for constraint in self.constraints:
            is_valid, error_msg, _ = constraint.validate(config)
            if not is_valid:
                errors.append(f"Constraint '{constraint.description}': {error_msg}")

        return len(errors) == 0, errors

    def sample(
        self,
        rng: np.random.Generator,
        overrides: dict[str, Any] | None = None,
        constraint_mode: ConstraintMode = ConstraintMode.REJECT,
        max_repair_attempts: int = 10,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """Sample a configuration.

        Args:
            rng: Random number generator
            overrides: Optional fixed values
            constraint_mode: How to handle constraint violations
            max_repair_attempts: Maximum repair attempts

        Returns:
            Tuple of (config_dict, provenance_dict)
        """
        overrides = overrides or {}
        config = {}
        provenance = {}

        # Sample all parameters
        for path, param in self.params.items():
            if path in overrides:
                config[path] = overrides[path]
                provenance[path] = "override"
            else:
                value = param.sample(rng)
                config[path] = value
                provenance[path] = f"sampled({param.__class__.__name__})"

        # Set nested values
        nested_config = self._set_nested_values(config)

        # Apply conditions
        for condition in self.conditions:
            if condition.evaluate(nested_config):
                for activate_path in condition.activate_params:
                    if activate_path in self.params:
                        param = self.params[activate_path]
                        if activate_path not in nested_config:
                            value = param.sample(rng)
                            self._set_nested(nested_config, activate_path, value)
                            provenance[activate_path] = f"activated({param.__class__.__name__})"

        # Validate constraints
        attempts = 0
        while attempts < max_repair_attempts:
            valid = True
            for constraint in self.constraints:
                is_valid, error_msg, repaired = constraint.validate(nested_config)
                if not is_valid:
                    if constraint_mode == ConstraintMode.REJECT:
                        # Re-sample
                        return self.sample(rng, overrides, constraint_mode, max_repair_attempts)
                    elif constraint_mode == ConstraintMode.REPAIR and repaired:
                        nested_config.update(repaired)
                        provenance[f"_repair_{attempts}"] = f"repaired: {error_msg}"
                    elif constraint_mode == ConstraintMode.WARN:
                        provenance[f"_warn_{attempts}"] = f"warning: {error_msg}"
                    else:
                        valid = False

            if valid:
                break
            attempts += 1

        return nested_config, provenance

    def to_json_schema(self) -> dict[str, Any]:
        """Generate JSON schema representation.

        Returns:
            JSON schema dictionary
        """
        schema = {
            "type": "object",
            "properties": {},
            "required": [],
        }

        for path, param in self.params.items():
            param_dict = param.to_dict()
            schema["properties"][path] = {
                "type": self._param_type_to_json(param),
                "default": param.default,
                "description": param.description,
            }

            if isinstance(param, (FloatParam, IntParam)):
                schema["properties"][path]["minimum"] = param.min_val
                schema["properties"][path]["maximum"] = param.max_val

            if isinstance(param, ChoiceParam):
                schema["properties"][path]["enum"] = param.choices

        return schema

    def _param_type_to_json(self, param: Param) -> str:
        """Convert param type to JSON schema type."""
        if isinstance(param, (FloatParam, Vector2Param, Vector3Param)):
            return "number"
        elif isinstance(param, IntParam):
            return "integer"
        elif isinstance(param, BoolParam):
            return "boolean"
        elif isinstance(param, (ChoiceParam, ColorParam)):
            return "string"
        else:
            return "any"

    def _get_nested(self, d: dict, path: str) -> Any:
        """Get nested value from dictionary."""
        parts = path.split(".")
        v = d
        for part in parts:
            if isinstance(v, dict):
                v = v.get(part)
            else:
                return None
        return v

    def _set_nested(self, d: dict, path: str, value: Any) -> None:
        """Set nested value in dictionary."""
        parts = path.split(".")
        current = d
        for part in parts[:-1]:
            if part not in current:
                current[part] = {}
            current = current[part]
        current[parts[-1]] = value

    def _set_nested_values(self, flat_config: dict[str, Any]) -> dict[str, Any]:
        """Convert flat config to nested structure."""
        nested = {}
        for path, value in flat_config.items():
            self._set_nested(nested, path, value)
        return nested
