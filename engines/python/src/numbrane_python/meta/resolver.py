"""Meta-control resolution engine."""

import copy
from dataclasses import dataclass, field
from typing import Any

from numbrane_python.meta.control import get_meta_controls
from numbrane_python.params.normalize import canonicalize_params, param_hash_short
from numbrane_python.params.schema import ParamSchema
from numbrane_python.params.validate import validate_params


@dataclass
class ResolutionProvenance:
    """Provenance for meta-control resolution."""

    base_config: dict[str, Any]
    meta_controls: dict[str, float]
    changes: dict[str, Any] = field(default_factory=dict)
    conflicts: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    resolved_config: dict[str, Any] = field(default_factory=dict)
    param_hash: str = ""
    intent_text: str | None = None
    intent_explanation: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        result = {
            "base_config": self.base_config,
            "meta_controls": self.meta_controls,
            "changes": self.changes,
            "conflicts": self.conflicts,
            "warnings": self.warnings,
            "resolved_config": self.resolved_config,
            "param_hash": self.param_hash,
        }
        if self.intent_text:
            result["intent_text"] = self.intent_text
        if self.intent_explanation:
            result["intent_explanation"] = self.intent_explanation
        return result


class MetaResolver:
    """Resolves meta-controls into concrete parameters."""

    def __init__(self):
        """Initialize resolver."""
        self.meta_controls = get_meta_controls()

    def resolve(
        self,
        base_config: dict[str, Any],
        meta_controls: dict[str, float],
        schema: ParamSchema,
        context: dict[str, Any] | None = None,
    ) -> tuple[dict[str, Any], ResolutionProvenance]:
        """Resolve meta-controls into a fully resolved config.

        Args:
            base_config: Base configuration dictionary
            meta_controls: Dictionary of meta-control name -> value [0.0, 1.0]
            schema: Parameter schema
            context: Optional context for conditional rules

        Returns:
            Tuple of (resolved_config, provenance)
        """
        provenance = ResolutionProvenance(
            base_config=copy.deepcopy(base_config),
            meta_controls=copy.deepcopy(meta_controls),
        )

        # Start with base config
        resolved = copy.deepcopy(base_config)

        # Track all changes
        all_changes = {}
        param_conflicts = {}  # param_path -> list of (meta_control, value)

        # Apply each meta-control
        for meta_name, meta_value in meta_controls.items():
            if meta_name not in self.meta_controls:
                provenance.warnings.append(f"Unknown meta-control: {meta_name}")
                continue

            # Clamp meta value
            meta_value = max(0.0, min(1.0, float(meta_value)))

            meta_control = self.meta_controls[meta_name]

            # Get parameter changes from this meta-control
            changes = meta_control.mapping.apply(meta_value, schema, resolved, context)

            # Track conflicts
            for param_path, value in changes.items():
                if param_path in all_changes:
                    # Conflict detected
                    if param_path not in param_conflicts:
                        param_conflicts[param_path] = []
                    param_conflicts[param_path].append((meta_name, value))
                else:
                    all_changes[param_path] = value

        # Resolve conflicts (use priority or last-wins)
        for param_path, conflicts in param_conflicts.items():
            # For now, use last-wins (could be improved with priority)
            last_meta, last_value = conflicts[-1]
            all_changes[param_path] = last_value
            provenance.conflicts.append(
                f"{param_path}: conflicted between {[c[0] for c in conflicts]}, using {last_meta}={last_value:.3f}"
            )

        # Apply changes to resolved config
        for param_path, value in all_changes.items():
            _set_nested(resolved, param_path, value)
            provenance.changes[param_path] = value

        # Validate resolved config
        is_valid, violations = validate_params(schema, resolved)
        if not is_valid:
            for violation in violations:
                provenance.warnings.append(f"Validation: {violation.path} - {violation.message}")

        # Store resolved config and hash
        provenance.resolved_config = resolved
        canonical = canonicalize_params(resolved)
        provenance.param_hash = param_hash_short(canonical)

        return resolved, provenance

    def explain(
        self,
        meta_controls: dict[str, float],
        schema: ParamSchema,
    ) -> dict[str, Any]:
        """Explain what meta-controls would do without applying them.

        Args:
            meta_controls: Dictionary of meta-control name -> value
            schema: Parameter schema

        Returns:
            Explanation dictionary
        """
        explanation = {
            "meta_controls": {},
            "affected_parameters": {},
        }

        for meta_name, meta_value in meta_controls.items():
            if meta_name not in self.meta_controls:
                continue

            meta_value = max(0.0, min(1.0, float(meta_value)))
            meta_control = self.meta_controls[meta_name]

            # Get parameter info
            param_info = {}
            if hasattr(schema, "params"):
                for param in schema.params:
                    if hasattr(param, "min_val") and hasattr(param, "max_val"):
                        param_info[param.path] = {
                            "min": param.min_val,
                            "max": param.max_val,
                            "description": getattr(param, "description", ""),
                        }

            # Apply mapping to see what would change
            changes = meta_control.mapping.apply(meta_value, schema, {}, None)

            explanation["meta_controls"][meta_name] = {
                "value": meta_value,
                "description": meta_control.description,
                "affected_params": len(changes),
            }

            for param_path, value in changes.items():
                if param_path not in explanation["affected_parameters"]:
                    explanation["affected_parameters"][param_path] = {
                        "current": None,  # Would need base config
                        "new": value,
                        "meta_controls": [],
                    }
                explanation["affected_parameters"][param_path]["meta_controls"].append(meta_name)

        return explanation


def resolve_meta_controls(
    base_config: dict[str, Any],
    meta_controls: dict[str, float],
    schema: ParamSchema,
    context: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], ResolutionProvenance]:
    """Convenience function to resolve meta-controls.

    Args:
        base_config: Base configuration
        meta_controls: Meta-control values
        schema: Parameter schema
        context: Optional context

    Returns:
        Tuple of (resolved_config, provenance)
    """
    resolver = MetaResolver()
    return resolver.resolve(base_config, meta_controls, schema, context)


def _set_nested(d: dict, path: str, value: Any) -> None:
    """Set nested value in dictionary."""
    parts = path.split(".")
    current = d
    for part in parts[:-1]:
        if part not in current:
            current[part] = {}
        current = current[part]
    current[parts[-1]] = value
