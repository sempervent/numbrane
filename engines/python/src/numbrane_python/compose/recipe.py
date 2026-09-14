"""Recipe schema for composition."""

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from numbrane_python.core.registry import get_registry
from numbrane_python.params.schema import get_registry as get_schema_registry
from numbrane_python.params.validate import validate_params


class RecipeOutput(BaseModel):
    """Output configuration."""

    width: int = Field(default=1920, description="Canvas width")
    height: int = Field(default=1080, description="Canvas height")
    dpi: int | None = Field(default=None, description="DPI for vector output")
    format: Literal["png", "svg", "gif", "mp4"] = Field(default="png", description="Output format")
    bg: str | list[str] | None = Field(
        default=None, description="Background color (hex or palette)"
    )


class RecipeBlend(BaseModel):
    """Blend configuration."""

    type: Literal["layered", "interleaved", "sequential"] = Field(default="layered")
    layers: list[dict[str, Any]] | None = Field(
        default=None, description="Layer definitions for layered mode"
    )
    schedule: list[dict[str, Any]] | None = Field(
        default=None, description="Schedule for interleaved mode"
    )
    composite: str | None = Field(default="over", description="Compositing mode")


class RecipeTime(BaseModel):
    """Time/animation configuration."""

    duration: float | None = Field(default=None, description="Duration in seconds")
    fps: int | None = Field(default=30, description="Frames per second")
    frames: int | None = Field(default=1, description="Number of frames")
    meta_trajectories: dict[str, list[float]] | None = Field(
        default=None, description="Meta-control trajectories over time"
    )


class RecipeSketch(BaseModel):
    """Sketch entry in recipe."""

    id: str = Field(..., description="Unique identifier for this sketch instance")
    sketch: str = Field(..., description="Sketch name")
    weight: float = Field(default=1.0, description="Weight for blending")
    enabled: bool = Field(default=True, description="Whether this sketch is enabled")
    config: dict[str, Any] = Field(
        default_factory=dict, description="Sketch-specific configuration"
    )
    meta: dict[str, float] | None = Field(
        default=None, description="Local meta-control overrides"
    )
    inputs: dict[str, str] | None = Field(
        default=None, description="Input mappings (shared fields/canvases)"
    )
    outputs: dict[str, str] | None = Field(
        default=None, description="Output mappings (named layers)"
    )

    @field_validator("sketch")
    def validate_sketch(cls, v):
        """Validate sketch exists."""
        registry = get_registry()
        if not registry.get(v):
            raise ValueError(f"Sketch '{v}' not found in registry")
        return v

    def validate_config(self) -> tuple[bool, list[str]]:
        """Validate config against sketch schema.

        Returns:
            Tuple of (is_valid, list of errors)
        """
        registry = get_registry()
        sketch_info = registry.get(self.sketch)
        if not sketch_info:
            return False, [f"Sketch '{self.sketch}' not found"]

        # Get schema
        schema_registry = get_schema_registry()
        schema = schema_registry.get(self.sketch)

        if not schema:
            # Try to validate with config class
            try:
                config_obj = sketch_info.config_class(**self.config)
                return True, []
            except Exception as e:
                return False, [str(e)]

        # Validate with schema
        is_valid, violations = validate_params(schema, self.config)
        if is_valid:
            return True, []
        else:
            return False, [v.message for v in violations]


class RecipeComposite(BaseModel):
    """Composite configuration."""

    mode: Literal["sequential", "layered", "interleaved", "field_shared"] = Field(default="layered")
    blend: RecipeBlend = Field(default_factory=RecipeBlend)
    time: RecipeTime | None = Field(default=None, description="Time/animation settings")


class RecipeCompatAutofix(BaseModel):
    """Autofix options."""

    allow_field_adapters: bool = Field(
        default=True, description="Allow scalar↔vector field adapters"
    )
    allow_palette_coercion: bool = Field(default=True, description="Allow palette coercion")
    allow_alpha_add: bool = Field(default=True, description="Allow adding alpha channels")
    allow_default_fill: bool = Field(
        default=True, description="Allow filling missing parameters with defaults"
    )
    allow_parameter_projection: bool = Field(
        default=True, description="Allow taxonomy-based parameter projection"
    )
    allow_downsample: bool = Field(
        default=False, description="Allow downsampling for compatibility"
    )


class RecipeCompat(BaseModel):
    """Compatibility checking configuration."""

    policy: Literal["strict", "warn", "autofix"] = Field(default="warn")
    autofix: RecipeCompatAutofix = Field(default_factory=RecipeCompatAutofix)


class Recipe(BaseModel):
    """Top-level recipe model."""

    version: str = Field(default="1.0", description="Recipe format version")
    name: str = Field(..., description="Recipe name")
    seed: int | str = Field(..., description="Random seed (or 'random' for auto-generation)")
    output: RecipeOutput = Field(default_factory=RecipeOutput)
    composite: RecipeComposite = Field(default_factory=RecipeComposite)
    sketches: list[RecipeSketch] = Field(
        ..., min_length=2, description="List of sketches to compose"
    )
    meta: dict[str, float] | None = Field(default=None, description="Global meta-controls")
    presets: list[dict[str, Any]] | None = Field(
        default=None, description="Named preset variants"
    )
    compat: RecipeCompat = Field(default_factory=RecipeCompat)

    @field_validator("sketches")
    def validate_sketches(cls, v):
        """Validate sketches list."""
        if len(v) < 2:
            raise ValueError("Recipe must contain at least 2 sketches")

        # Check for duplicate IDs
        ids = [s.id for s in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate sketch IDs found")

        return v

    def resolve_seed(self) -> int:
        """Resolve seed deterministically.

        If seed is 'random', generates a deterministic seed based on recipe hash.

        Returns:
            Resolved seed integer
        """
        if isinstance(self.seed, int):
            return self.seed

        if self.seed == "random":
            # Generate deterministic seed from recipe content
            import hashlib

            recipe_str = self.model_dump_json(sort_keys=True)
            seed_hash = hashlib.sha256(recipe_str.encode()).hexdigest()
            return int(seed_hash[:8], 16) % (2**31)

        raise ValueError(f"Invalid seed value: {self.seed}")

    def validate_all_configs(self) -> tuple[bool, dict[str, list[str]]]:
        """Validate all sketch configs.

        Returns:
            Tuple of (all_valid, dict of sketch_id -> list of errors)
        """
        errors = {}
        all_valid = True

        for sketch in self.sketches:
            is_valid, sketch_errors = sketch.validate_config()
            if not is_valid:
                all_valid = False
                errors[sketch.id] = sketch_errors

        return all_valid, errors


def load_recipe(path: str) -> Recipe:
    """Load recipe from YAML or JSON file.

    Args:
        path: Path to recipe file

    Returns:
        Recipe object
    """
    import json
    from pathlib import Path

    import yaml

    recipe_path = Path(path)
    if not recipe_path.exists():
        raise FileNotFoundError(f"Recipe file not found: {path}")

    with open(recipe_path) as f:
        if recipe_path.suffix in [".yaml", ".yml"]:
            data = yaml.safe_load(f)
        elif recipe_path.suffix == ".json":
            data = json.load(f)
        else:
            raise ValueError(f"Unsupported recipe format: {recipe_path.suffix}")

    return Recipe(**data)
