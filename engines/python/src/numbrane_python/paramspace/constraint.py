"""Parameter constraints."""

from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum
from typing import Any


class ConstraintMode(Enum):
    """Constraint handling mode."""

    REJECT = "reject"  # Reject invalid samples
    REPAIR = "repair"  # Attempt to repair invalid samples
    WARN = "warn"  # Warn but allow invalid samples


@dataclass
class Constraint:
    """Constraint on parameters."""

    constraint_func: Callable[
        [dict[str, Any]], tuple[bool, str | None, dict[str, Any] | None]
    ]
    description: str

    def validate(
        self, config: dict[str, Any]
    ) -> tuple[bool, str | None, dict[str, Any] | None]:
        """Validate constraint.

        Args:
            config: Configuration dictionary

        Returns:
            Tuple of (is_valid, error_message, repaired_config)
            If is_valid is True, error_message is None
            If repair is possible, repaired_config contains fixes
        """
        try:
            return self.constraint_func(config)
        except Exception as e:
            return False, f"Constraint evaluation error: {e}", None

    @staticmethod
    def less_than(path_a: str, path_b: str) -> "Constraint":
        """Create a < b constraint."""

        def get_nested(d: dict, p: str) -> Any:
            parts = p.split(".")
            v = d
            for part in parts:
                if isinstance(v, dict):
                    v = v.get(part)
                else:
                    return None
            return v

        def constraint_func(
            config: dict[str, Any],
        ) -> tuple[bool, str | None, dict[str, Any] | None]:
            a = get_nested(config, path_a)
            b = get_nested(config, path_b)
            if a is None or b is None:
                return False, f"Missing values for {path_a} or {path_b}", None
            if a < b:
                return True, None, None
            # Repair: set a to b - epsilon
            repaired = config.copy()
            # Would need to set nested value - simplified for now
            return False, f"{path_a} ({a}) must be < {path_b} ({b})", None

        desc = f"{path_a} < {path_b}"
        return Constraint(constraint_func, desc)

    @staticmethod
    def sum_equals(paths: list[str], target: float) -> "Constraint":
        """Create sum constraint."""

        def get_nested(d: dict, p: str) -> Any:
            parts = p.split(".")
            v = d
            for part in parts:
                if isinstance(v, dict):
                    v = v.get(part)
                else:
                    return None
            return v

        def constraint_func(
            config: dict[str, Any],
        ) -> tuple[bool, str | None, dict[str, Any] | None]:
            values = [get_nested(config, p) for p in paths]
            if any(v is None for v in values):
                return False, "Missing values", None
            total = sum(values)
            if abs(total - target) < 1e-6:
                return True, None, None
            # Repair: normalize
            if total > 0:
                repaired = config.copy()
                scale = target / total
                # Would need to set nested values
                return False, f"Sum {total} != {target}", None
            return False, f"Sum {total} != {target}", None

        desc = f"sum({', '.join(paths)}) == {target}"
        return Constraint(constraint_func, desc)

    @staticmethod
    def custom(
        func: Callable[[dict[str, Any]], tuple[bool, str | None, dict[str, Any] | None]],
        description: str,
    ) -> "Constraint":
        """Create custom constraint."""
        return Constraint(func, description)
