"""Composite sketch framework for blending multiple sketches."""

import copy
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from numbrane_python.core.registry import get_registry
from numbrane_python.params.schema import ParamSchema


class BlendMode(str, Enum):
    """Blending modes for composite sketches."""

    SEQUENTIAL = "sequential"  # Render sketches in sequence, overlay
    LAYERED = "layered"  # Render to separate layers, blend
    INTERLEAVED = "interleaved"  # Alternate steps between sketches
    FIELD_SHARED = "field_shared"  # Share field systems, render separately


@dataclass
class CompositeSketch:
    """Composite sketch combining multiple sketches."""

    name: str
    sketch_names: list[str]
    blend_mode: BlendMode = BlendMode.LAYERED
    weights: list[float] | None = None  # Per-sketch weights
    shared_params: dict[str, Any] = field(default_factory=dict)  # Shared via taxonomy
    overrides: dict[str, dict[str, Any]] = field(default_factory=dict)  # Per-sketch overrides

    def __post_init__(self):
        """Initialize weights if not provided."""
        if self.weights is None:
            self.weights = [1.0 / len(self.sketch_names)] * len(self.sketch_names)
        elif len(self.weights) != len(self.sketch_names):
            # Normalize weights
            total = sum(self.weights)
            self.weights = [w / total for w in self.weights]

    def get_merged_schema(self) -> ParamSchema:
        """Get merged parameter schema.

        Returns:
            Merged ParamSchema
        """
        registry = get_registry()
        from numbrane_python.core.schema_registry import register_sketch_schemas
        from numbrane_python.params.schema import ParamSchema
        from numbrane_python.params.schema import get_registry as get_schema_registry

        register_sketch_schemas()
        schema_registry = get_schema_registry()

        # Collect all parameters
        all_params = []
        param_paths = set()

        for sketch_name in self.sketch_names:
            schema = schema_registry.get(sketch_name)
            if schema:
                for param in schema.params:
                    # Use taxonomy path as key to avoid duplicates
                    if param.path not in param_paths:
                        all_params.append(param)
                        param_paths.add(param.path)

        # Create merged schema
        merged = ParamSchema(
            name=self.name,
            description=f"Composite of {', '.join(self.sketch_names)}",
            params=all_params,
        )

        return merged

    def resolve_configs(
        self,
        base_config: dict[str, Any] | None = None,
        meta_controls: dict[str, float] | None = None,
    ) -> list[dict[str, Any]]:
        """Resolve configurations for each sketch.

        Args:
            base_config: Base configuration (shared)
            meta_controls: Meta-control values

        Returns:
            List of resolved configs, one per sketch
        """
        from numbrane_python.meta.resolver import MetaResolver

        registry = get_registry()
        from numbrane_python.core.schema_registry import register_sketch_schemas
        from numbrane_python.params.schema import get_registry as get_schema_registry

        register_sketch_schemas()
        schema_registry = get_schema_registry()
        resolver = MetaResolver()

        resolved_configs = []

        for i, sketch_name in enumerate(self.sketch_names):
            # Get sketch schema
            schema = schema_registry.get(sketch_name)
            if not schema:
                # Fall back to sketch info
                sketch_info = registry.get(sketch_name)
                if sketch_info and sketch_info.config_class:
                    config_obj = sketch_info.config_class()
                    config = config_obj.model_dump() if hasattr(config_obj, "model_dump") else {}
                else:
                    config = {}
            else:
                # Get defaults
                defaults = schema_registry.get_defaults(sketch_name) or {}
                config = copy.deepcopy(defaults)

            # Apply base config (shared params via taxonomy)
            if base_config:
                for key, value in base_config.items():
                    if key in self.shared_params or self._is_shared_param(key):
                        _set_nested(config, key, value)

            # Apply sketch-specific overrides
            if sketch_name in self.overrides:
                for key, value in self.overrides[sketch_name].items():
                    _set_nested(config, key, value)

            # Apply meta-controls if provided
            if meta_controls and schema:
                resolved, _ = resolver.resolve(config, meta_controls, schema)
                config = resolved

            resolved_configs.append(config)

        return resolved_configs

    def _is_shared_param(self, param_path: str) -> bool:
        """Check if parameter should be shared across sketches."""
        # Shared parameters are those in common taxonomy namespaces
        shared_namespaces = ["field", "color", "post", "output", "seed"]
        return any(param_path.startswith(ns + ".") for ns in shared_namespaces)


def create_composite(
    name: str,
    sketch_names: list[str],
    blend_mode: BlendMode = BlendMode.LAYERED,
    weights: list[float] | None = None,
    shared_params: dict[str, Any] | None = None,
    overrides: dict[str, dict[str, Any]] | None = None,
) -> CompositeSketch:
    """Create a composite sketch.

    Args:
        name: Composite name
        sketch_names: List of sketch names to combine
        blend_mode: How to blend sketches
        weights: Per-sketch weights
        shared_params: Shared parameters
        overrides: Per-sketch parameter overrides

    Returns:
        CompositeSketch instance
    """
    return CompositeSketch(
        name=name,
        sketch_names=sketch_names,
        blend_mode=blend_mode,
        weights=weights,
        shared_params=shared_params or {},
        overrides=overrides or {},
    )


def _set_nested(d: dict, path: str, value: Any) -> None:
    """Set nested value in dictionary."""
    parts = path.split(".")
    current = d
    for part in parts[:-1]:
        if part not in current:
            current[part] = {}
        current = current[part]
    current[parts[-1]] = value
