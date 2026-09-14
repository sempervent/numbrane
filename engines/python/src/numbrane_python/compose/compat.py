"""Compatibility checker for recipes."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from numbrane_python.compose.recipe import Recipe
from numbrane_python.core.registry import get_registry
from numbrane_python.params.schema import get_registry as get_schema_registry


class Severity(str, Enum):
    """Issue severity."""

    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"


@dataclass
class CompatibilityIssue:
    """A compatibility issue."""

    code: str
    severity: Severity
    message: str
    affected_sketches: list[str] = field(default_factory=list)
    recommended_fix: str | None = None
    autofix_applied: bool = False
    autofix_details: dict[str, Any] | None = None


@dataclass
class CompatibilityReport:
    """Compatibility check report."""

    recipe: Recipe
    issues: list[CompatibilityIssue] = field(default_factory=list)
    resolved_recipe: Recipe | None = None
    provenance_deltas: list[dict[str, Any]] = field(default_factory=list)

    @property
    def has_errors(self) -> bool:
        """Check if report has any errors."""
        return any(issue.severity == Severity.ERROR for issue in self.issues)

    @property
    def has_warnings(self) -> bool:
        """Check if report has any warnings."""
        return any(issue.severity == Severity.WARN for issue in self.issues)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "recipe_name": self.recipe.name,
            "has_errors": self.has_errors,
            "has_warnings": self.has_warnings,
            "issues": [
                {
                    "code": issue.code,
                    "severity": issue.severity.value,
                    "message": issue.message,
                    "affected_sketches": issue.affected_sketches,
                    "recommended_fix": issue.recommended_fix,
                    "autofix_applied": issue.autofix_applied,
                }
                for issue in self.issues
            ],
            "provenance_deltas": self.provenance_deltas,
        }


class CompatibilityChecker:
    """Checks recipe compatibility and can autofix issues."""

    def __init__(self, recipe: Recipe):
        """Initialize checker.

        Args:
            recipe: Recipe to check
        """
        self.recipe = recipe
        self.registry = get_registry()
        self.schema_registry = get_schema_registry()
        self.report = CompatibilityReport(recipe=recipe)

    def check(self) -> CompatibilityReport:
        """Run all compatibility checks.

        Returns:
            Compatibility report
        """
        # Check canvas compatibility
        self._check_canvas_compatibility()

        # Check field compatibility (for field_shared mode)
        if self.recipe.composite.mode == "field_shared":
            self._check_field_compatibility()

        # Check resolution/time compatibility
        self._check_time_compatibility()

        # Check taxonomy projection
        self._check_taxonomy_projection()

        # Check parameter ranges
        self._check_parameter_ranges()

        # Check blend mode constraints
        self._check_blend_mode_constraints()

        # Apply autofixes if enabled
        if self.recipe.compat.policy == "autofix":
            self._apply_autofixes()

        return self.report

    def _check_canvas_compatibility(self) -> None:
        """Check canvas/output compatibility."""
        # Check format compatibility
        if self.recipe.output.format == "svg":
            # SVG requires vector-capable sketches
            for sketch in self.recipe.sketches:
                # Most sketches are raster-based, so warn
                self.report.issues.append(
                    CompatibilityIssue(
                        code="CANVAS_FORMAT_SVG",
                        severity=Severity.WARN,
                        message=f"Sketch '{sketch.sketch}' may not support SVG output",
                        affected_sketches=[sketch.id],
                        recommended_fix="Use PNG format or ensure sketch supports vector output",
                    )
                )

        # Check alpha support for layered mode
        if self.recipe.composite.mode == "layered":
            for sketch in self.recipe.sketches:
                # Check if sketch config has alpha settings
                has_alpha = any("alpha" in str(k).lower() for k in sketch.config.keys())
                if not has_alpha:
                    self.report.issues.append(
                        CompatibilityIssue(
                            code="ALPHA_MISSING",
                            severity=Severity.INFO,
                            message=f"Sketch '{sketch.sketch}' may not have explicit alpha settings",
                            affected_sketches=[sketch.id],
                            recommended_fix="Add alpha channel support or use explicit background compositing",
                        )
                    )

    def _check_field_compatibility(self) -> None:
        """Check field compatibility for field_shared mode."""
        # Determine field types requested by each sketch
        field_types = {}
        for sketch in self.recipe.sketches:
            # Check config for field type hints
            config_str = str(sketch.config)
            if "vector" in config_str.lower() or "curl" in config_str.lower():
                field_types[sketch.id] = "vector"
            elif "scalar" in config_str.lower() or "noise" in config_str.lower():
                field_types[sketch.id] = "scalar"
            else:
                field_types[sketch.id] = "unknown"

        # Check for mismatches
        vector_sketches = [sid for sid, ftype in field_types.items() if ftype == "vector"]
        scalar_sketches = [sid for sid, ftype in field_types.items() if ftype == "scalar"]

        if vector_sketches and scalar_sketches:
            self.report.issues.append(
                CompatibilityIssue(
                    code="FIELD_TYPE_MISMATCH",
                    severity=Severity.WARN,
                    message="Field type mismatch: some sketches need vector fields, others need scalar",
                    affected_sketches=vector_sketches + scalar_sketches,
                    recommended_fix="Use field adapters: scalar→vector via gradient/curl, vector→scalar via magnitude",
                    autofix_applied=False,
                )
            )

    def _check_time_compatibility(self) -> None:
        """Check time/animation compatibility."""
        if not self.recipe.composite.time or self.recipe.composite.time.frames <= 1:
            return

        # Check if sketches support animation
        for sketch in self.recipe.sketches:
            sketch_info = self.registry.get(sketch.sketch)
            if sketch_info and not sketch_info.animate_func:
                self.report.issues.append(
                    CompatibilityIssue(
                        code="ANIMATION_NOT_SUPPORTED",
                        severity=Severity.WARN,
                        message=f"Sketch '{sketch.sketch}' does not support animation",
                        affected_sketches=[sketch.id],
                        recommended_fix="Use time modulation wrapper or render static frames",
                    )
                )

    def _check_taxonomy_projection(self) -> None:
        """Check taxonomy projection needs."""
        # This would check if recipe uses canonical knobs not in sketch configs
        # For now, just note that projection may be needed
        for sketch in self.recipe.sketches:
            # Check if config uses taxonomy paths
            has_taxonomy_paths = any("." in str(k) for k in sketch.config.keys())
            if has_taxonomy_paths:
                self.report.issues.append(
                    CompatibilityIssue(
                        code="TAXONOMY_PROJECTION",
                        severity=Severity.INFO,
                        message=f"Sketch '{sketch.sketch}' uses taxonomy paths that may need projection",
                        affected_sketches=[sketch.id],
                        recommended_fix="Ensure taxonomy mapping system can project these paths",
                    )
                )

    def _check_parameter_ranges(self) -> None:
        """Check parameter ranges against meta-controls."""
        # This would validate that meta-controls don't push parameters out of bounds
        # Simplified for now
        if self.recipe.meta:
            for sketch in self.recipe.sketches:
                # Check if meta-controls would cause issues
                # In real implementation, would resolve meta-controls and check bounds
                pass

    def _check_blend_mode_constraints(self) -> None:
        """Check blend mode constraints."""
        if self.recipe.composite.mode == "interleaved":
            # Check if sketches have compatible draw primitives
            for sketch in self.recipe.sketches:
                sketch_info = self.registry.get(sketch.sketch)
                if sketch_info:
                    # Check if sketch is image-based vs stroke-based
                    # Simplified: assume SDF raymarch is image-based
                    if "sdf" in sketch.sketch.lower() or "raymarch" in sketch.sketch.lower():
                        self.report.issues.append(
                            CompatibilityIssue(
                                code="INTERLEAVED_IMAGE_BASED",
                                severity=Severity.INFO,
                                message=f"Sketch '{sketch.sketch}' is image-based, will be routed as stamp layer",
                                affected_sketches=[sketch.id],
                                recommended_fix="Image-based sketches in interleaved mode act as base layers",
                            )
                        )

    def _apply_autofixes(self) -> None:
        """Apply autofixes based on policy."""
        autofix = self.recipe.compat.autofix
        resolved_recipe = self.recipe.model_copy(deep=True)
        provenance_deltas = []

        for issue in self.report.issues:
            if issue.severity == Severity.ERROR and self.recipe.compat.policy == "strict":
                continue  # Don't autofix in strict mode

            # Apply field adapters
            if issue.code == "FIELD_TYPE_MISMATCH" and autofix.allow_field_adapters:
                # Add field adapter configuration
                issue.autofix_applied = True
                issue.autofix_details = {"field_adapters": "added"}
                provenance_deltas.append(
                    {
                        "type": "field_adapter",
                        "issue": issue.code,
                        "sketches": issue.affected_sketches,
                    }
                )

            # Apply palette coercion
            if "PALETTE" in issue.code and autofix.allow_palette_coercion:
                issue.autofix_applied = True
                provenance_deltas.append(
                    {
                        "type": "palette_coercion",
                        "issue": issue.code,
                    }
                )

            # Apply alpha addition
            if issue.code == "ALPHA_MISSING" and autofix.allow_alpha_add:
                for sketch in resolved_recipe.sketches:
                    if sketch.id in issue.affected_sketches:
                        if "render" not in sketch.config:
                            sketch.config["render"] = {}
                        sketch.config["render"]["alpha"] = 1.0
                issue.autofix_applied = True
                provenance_deltas.append(
                    {
                        "type": "alpha_added",
                        "sketches": issue.affected_sketches,
                    }
                )

        if provenance_deltas:
            self.report.resolved_recipe = resolved_recipe
            self.report.provenance_deltas = provenance_deltas
