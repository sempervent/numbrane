"""Parameter validation and constraints."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from numbrane_python.params.schema import ParamSchema


@dataclass
class ConstraintViolation:
    """Constraint violation information."""

    path: str
    message: str
    expected: str | None = None
    actual: Any = None
    suggestion: str | None = None


class Constraint:
    """Parameter constraint."""

    def __init__(
        self,
        constraint_func: Callable[[dict[str, Any]], tuple[bool, str | None]],
        description: str,
    ):
        """Initialize constraint.

        Args:
            constraint_func: Function that takes params dict and returns (is_valid, error_message)
            description: Human-readable description
        """
        self.constraint_func = constraint_func
        self.description = description

    def validate(self, params: dict[str, Any]) -> tuple[bool, str | None]:
        """Validate constraint.

        Args:
            params: Parameter dictionary

        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            return self.constraint_func(params)
        except Exception as e:
            return False, f"Constraint evaluation error: {e}"


def validate_params(
    schema: "ParamSchema",
    params: dict[str, Any],
) -> tuple[bool, list[ConstraintViolation]]:
    """Validate parameters against schema.

    Args:
        schema: Parameter schema
        params: Parameter dictionary to validate

    Returns:
        Tuple of (is_valid, list_of_violations)
    """
    violations = []

    # Validate individual parameters
    for param in schema.params:
        value = _get_nested(params, param.path)
        if value is not None:
            if not param.validate(value):
                violations.append(
                    ConstraintViolation(
                        path=param.path,
                        message=f"Invalid value for {param.path}",
                        actual=value,
                        expected=f"{param.__class__.__name__}",
                    )
                )

    # Validate constraints
    for constraint in schema.constraints:
        is_valid, error_msg = constraint.validate(params)
        if not is_valid:
            violations.append(
                ConstraintViolation(
                    path="constraint",
                    message=error_msg or constraint.description,
                )
            )

    return len(violations) == 0, violations


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
