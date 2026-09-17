"""Recipe execution runner."""

import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np

from numbrane_python.compose.recipe import Recipe
from numbrane_python.core.config import Quality
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.registry import get_registry
from numbrane_python.core.render_result import RenderResult
from numbrane_python.core.rng import RNG
from numbrane_python.meta.resolver import MetaResolver
from numbrane_python.render.canvas import Canvas


class RecipeRunner:
    """Executes recipe compositions."""

    def __init__(self, recipe: Recipe):
        """Initialize runner.

        Args:
            recipe: Recipe to execute
        """
        self.recipe = recipe
        self.registry = get_registry()
        self.meta_resolver = MetaResolver()
        self.provenance: dict[str, Any] = {}

    def run(self, output_path: Path | None = None) -> RenderResult:
        """Execute recipe and render composite.

        Args:
            output_path: Optional output path

        Returns:
            RenderResult
        """
        # Resolve seed
        seed = self.recipe.resolve_seed()
        self.provenance["resolved_seed"] = seed
        self.provenance["original_seed"] = self.recipe.seed

        # Create RNG
        rng = RNG(seed)

        # Create context
        ctx = RenderContext(
            rng=rng,
            width=self.recipe.output.width,
            height=self.recipe.output.height,
            quality=Quality(mode="final", supersample=2),
            output_dir=output_path.parent if output_path else Path.cwd(),
        )

        # Create canvas
        canvas = Canvas(ctx.width, ctx.height, 3)

        # Set background
        if self.recipe.output.bg:
            if isinstance(self.recipe.output.bg, str):
                # Hex color or palette
                if self.recipe.output.bg.startswith("#"):
                    # Parse hex
                    hex_color = self.recipe.output.bg[1:]
                    r = int(hex_color[0:2], 16)
                    g = int(hex_color[2:4], 16)
                    b = int(hex_color[4:6], 16)
                    bg_color = np.array([r, g, b], dtype=np.uint8)
                else:
                    # Palette reference
                    from numbrane_python.render.palettes import get_palette

                    palette = get_palette(self.recipe.output.bg)
                    bg_color = np.array(palette[0], dtype=np.uint8)
                canvas.fill_background(bg_color)
            else:
                # List of colors (gradient)
                from numbrane_python.render.draw import draw_gradient

                colors = [np.array(c, dtype=np.uint8) for c in self.recipe.output.bg]
                if len(colors) >= 2:
                    draw_gradient(canvas.get_image(), colors[0], colors[1])

        # Execute based on composite mode
        if self.recipe.composite.mode == "layered":
            result = self._run_layered(canvas, ctx)
        elif self.recipe.composite.mode == "interleaved":
            result = self._run_interleaved(canvas, ctx)
        elif self.recipe.composite.mode == "sequential":
            result = self._run_sequential(canvas, ctx)
        elif self.recipe.composite.mode == "field_shared":
            result = self._run_field_shared(canvas, ctx)
        else:
            raise ValueError(f"Unknown composite mode: {self.recipe.composite.mode}")

        # Add provenance
        self.provenance["recipe_hash"] = self._compute_recipe_hash()
        self.provenance["recipe_name"] = self.recipe.name
        self.provenance["resolved_meta"] = self.recipe.meta or {}
        self.provenance["composite_mode"] = self.recipe.composite.mode

        result.metadata.update(self.provenance)

        return result

    def _run_layered(self, canvas: Canvas, ctx: RenderContext) -> RenderResult:
        """Run layered composition."""
        layers = []

        for sketch_entry in self.recipe.sketches:
            if not sketch_entry.enabled:
                continue

            # Get sketch
            sketch_info = self.registry.get(sketch_entry.sketch)
            if not sketch_info:
                raise ValueError(f"Sketch '{sketch_entry.sketch}' not found")

            # Resolve config with meta-controls
            base_config = sketch_entry.config.copy()

            # Apply global meta
            if self.recipe.meta:
                base_config = self._apply_meta_controls(base_config, self.recipe.meta, sketch_info)

            # Apply local meta
            if sketch_entry.meta:
                base_config = self._apply_meta_controls(base_config, sketch_entry.meta, sketch_info)

            # Create config object
            config_obj = sketch_info.config_class(**base_config)
            config_obj.seed = ctx.rng.seed + len(layers)  # Offset seed per layer
            config_obj.width = ctx.width
            config_obj.height = ctx.height

            # Render sketch
            layer_ctx = ctx.fork()
            layer_result = sketch_info.render_func(config_obj, layer_ctx)

            layers.append(
                {
                    "id": sketch_entry.id,
                    "image": layer_result.image,
                    "weight": sketch_entry.weight,
                    "opacity": 1.0,  # Would come from blend config
                }
            )

        # Composite layers
        final_image = canvas.get_image().copy()
        for layer in layers:
            alpha = layer["opacity"] * layer["weight"]
            final_image = final_image * (1 - alpha) + layer["image"] * alpha
            final_image = final_image.clip(0, 255).astype(np.uint8)

        return RenderResult(
            image=final_image,
            seed=ctx.rng.seed,
            sketch_name=f"composite:{self.recipe.name}",
            config=self.recipe,
        )

    def _run_interleaved(self, canvas: Canvas, ctx: RenderContext) -> RenderResult:
        """Run interleaved composition."""
        # For interleaved, render sketches in sequence, compositing as we go
        current_image = canvas.get_image().copy()

        for sketch_entry in self.recipe.sketches:
            if not sketch_entry.enabled:
                continue

            sketch_info = self.registry.get(sketch_entry.sketch)
            if not sketch_info:
                continue

            # Resolve config
            base_config = sketch_entry.config.copy()
            if self.recipe.meta:
                base_config = self._apply_meta_controls(base_config, self.recipe.meta, sketch_info)
            if sketch_entry.meta:
                base_config = self._apply_meta_controls(base_config, sketch_entry.meta, sketch_info)

            config_obj = sketch_info.config_class(**base_config)
            config_obj.seed = ctx.rng.seed
            config_obj.width = ctx.width
            config_obj.height = ctx.height

            # Render
            layer_result = sketch_info.render_func(config_obj, ctx)

            # Composite
            alpha = sketch_entry.weight
            current_image = current_image * (1 - alpha) + layer_result.image * alpha
            current_image = current_image.clip(0, 255).astype(np.uint8)

        return RenderResult(
            image=current_image,
            seed=ctx.rng.seed,
            sketch_name=f"composite:{self.recipe.name}",
            config=self.recipe,
        )

    def _run_sequential(self, canvas: Canvas, ctx: RenderContext) -> RenderResult:
        """Run sequential composition."""
        # Sequential: render each sketch fully, use last as result
        result = None

        for sketch_entry in self.recipe.sketches:
            if not sketch_entry.enabled:
                continue

            sketch_info = self.registry.get(sketch_entry.sketch)
            if not sketch_info:
                continue

            base_config = sketch_entry.config.copy()
            if self.recipe.meta:
                base_config = self._apply_meta_controls(base_config, self.recipe.meta, sketch_info)
            if sketch_entry.meta:
                base_config = self._apply_meta_controls(base_config, sketch_entry.meta, sketch_info)

            config_obj = sketch_info.config_class(**base_config)
            config_obj.seed = ctx.rng.seed
            config_obj.width = ctx.width
            config_obj.height = ctx.height

            result = sketch_info.render_func(config_obj, ctx)

        if result is None:
            raise ValueError("No sketches rendered")

        return RenderResult(
            image=result.image,
            seed=ctx.rng.seed,
            sketch_name=f"composite:{self.recipe.name}",
            config=self.recipe,
        )

    def _run_field_shared(self, canvas: Canvas, ctx: RenderContext) -> RenderResult:
        """Run field_shared composition."""
        # For field_shared, create a shared field and pass to sketches
        # Simplified: use layered mode for now
        return self._run_layered(canvas, ctx)

    def _apply_meta_controls(
        self, config: dict[str, Any], meta: dict[str, float], sketch_info
    ) -> dict[str, Any]:
        """Apply meta-controls to config.

        Args:
            config: Base configuration
            meta: Meta-control values
            sketch_info: Sketch information

        Returns:
            Resolved configuration
        """
        # Get schema
        from numbrane_python.params.schema import get_registry as get_schema_registry

        schema_registry = get_schema_registry()
        schema = schema_registry.get(sketch_info.name)

        if schema:
            # MetaResolver.resolve signature: (base_config, meta_controls, schema, context=None)
            resolved, _ = self.meta_resolver.resolve(
                base_config=config,
                meta_controls=meta,
                schema=schema,
            )
            return resolved

        return config

    def _compute_recipe_hash(self) -> str:
        """Compute hash of recipe for provenance."""
        recipe_dict = self.recipe.model_dump(exclude={"seed"})  # Exclude seed for determinism
        recipe_str = json.dumps(recipe_dict, sort_keys=True)
        return hashlib.sha256(recipe_str.encode()).hexdigest()[:16]
