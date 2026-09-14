"""Conditional parameter activation."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any


@dataclass
class Condition:
    """Condition for parameter activation."""

    condition_func: Callable[[dict[str, Any]], bool]
    description: str
    activate_params: list[str]
    deactivate_params: list[str] = None

    def __post_init__(self):
        """Initialize defaults."""
        if self.deactivate_params is None:
            self.deactivate_params = []

    def evaluate(self, config: dict[str, Any]) -> bool:
        """Evaluate condition.

        Args:
            config: Configuration dictionary

        Returns:
            True if condition is met
        """
        try:
            return self.condition_func(config)
        except (KeyError, TypeError, AttributeError):
            return False

    @staticmethod
    def when(path: str, operator: str, value: Any) -> "Condition":
        """Create a condition from a path expression.

        Args:
            path: Dot-separated path (e.g., "post.bloom.enabled")
            operator: Operator ("==", "!=", ">", "<", ">=", "<=", "in", "not_in")
            value: Value to compare against

        Returns:
            Condition instance
        """

        def get_nested_value(d: dict, p: str) -> Any:
            """Get nested value from dict."""
            parts = p.split(".")
            v = d
            for part in parts:
                if isinstance(v, dict):
                    v = v.get(part)
                else:
                    return None
            return v

        def condition_func(config: dict[str, Any]) -> bool:
            """Condition function."""
            actual_value = get_nested_value(config, path)

            if operator == "==":
                return actual_value == value
            elif operator == "!=":
                return actual_value != value
            elif operator == ">":
                return actual_value > value
            elif operator == "<":
                return actual_value < value
            elif operator == ">=":
                return actual_value >= value
            elif operator == "<=":
                return actual_value <= value
            elif operator == "in":
                return actual_value in value
            elif operator == "not_in":
                return actual_value not in value
            else:
                return False

        desc = f"{path} {operator} {value}"
        return Condition(condition_func, desc, activate_params=[], deactivate_params=[])
