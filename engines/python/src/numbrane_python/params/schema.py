"""Parameter schema definition and registry."""

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from numbrane_python.params.types import Param

if TYPE_CHECKING:
    from numbrane_python.params.validate import Constraint


@dataclass
class ParamSchema:
    """Parameter schema for a sketch or component."""

    name: str
    params: list[Param]
    constraints: list["Constraint"] = field(default_factory=list)
    description: str = ""
    version: str = "1.0"

    def get_param(self, path: str) -> Param | None:
        """Get parameter by path.

        Args:
            path: Dot-separated path

        Returns:
            Parameter or None
        """
        for param in self.params:
            if param.path == path:
                return param
        return None

    def get_defaults(self) -> dict[str, Any]:
        """Get default values for all parameters.

        Returns:
            Dictionary of default values
        """
        defaults = {}
        for param in self.params:
            self._set_nested(defaults, param.path, param.default)
        return defaults

    def _set_nested(self, d: dict, path: str, value: Any) -> None:
        """Set nested value in dictionary."""
        parts = path.split(".")
        current = d
        for part in parts[:-1]:
            if part not in current:
                current[part] = {}
            current = current[part]
        current[parts[-1]] = value


class SchemaRegistry:
    """Registry for parameter schemas."""

    def __init__(self):
        """Initialize registry."""
        self._schemas: dict[str, ParamSchema] = {}
        self._defaults: dict[str, dict[str, Any]] = {}
        self._presets: dict[str, dict[str, dict[str, Any]]] = {}

    def register(
        self,
        name: str,
        schema: ParamSchema,
        defaults: dict[str, Any] | None = None,
        presets: dict[str, dict[str, Any]] | None = None,
    ) -> None:
        """Register a schema.

        Args:
            name: Schema name (typically sketch name)
            schema: Parameter schema
            defaults: Default values (if None, uses schema defaults)
            presets: Named presets
        """
        self._schemas[name] = schema
        self._defaults[name] = defaults or schema.get_defaults()
        self._presets[name] = presets or {}

    def get(self, name: str) -> ParamSchema | None:
        """Get schema by name.

        Args:
            name: Schema name

        Returns:
            Schema or None
        """
        return self._schemas.get(name)

    def get_defaults(self, name: str) -> dict[str, Any] | None:
        """Get defaults for schema.

        Args:
            name: Schema name

        Returns:
            Defaults dictionary or None
        """
        return self._defaults.get(name)

    def get_presets(self, name: str) -> dict[str, dict[str, Any]]:
        """Get presets for schema.

        Args:
            name: Schema name

        Returns:
            Presets dictionary
        """
        return self._presets.get(name, {})

    def list(self) -> list[str]:
        """List all registered schema names.

        Returns:
            List of schema names
        """
        return sorted(self._schemas.keys())


# Global registry
_registry = SchemaRegistry()


def get_registry() -> SchemaRegistry:
    """Get global schema registry."""
    return _registry
