from __future__ import annotations

"""Ritual diagrams - schema definition."""

from pydantic import BaseModel, Field
from numbrane_python.params.schema import ParamSchema
from numbrane_python.params.types import (
    IntParam, FloatParam, BoolParam, ChoiceParam, ColorParam, Vec2Param,
)
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult


class RitualDiagramsConfig(BaseModel):
    """Configuration for ritual diagrams sketch."""
    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # SDF parameters
    num_shapes: int = Field(default=10)
    shape_scale: float = Field(default=0.15)
    primitive_types: str = Field(default="circle")

    # Symmetry parameters
    radial_symmetry: bool = Field(default=True)
    fold_count: int = Field(default=6)
    symmetry_center: tuple = Field(default=(0.5, 0.5))

    # Animation parameters
    anim_enabled: bool = Field(default=True)
    fps: int = Field(default=30)
    duration: float = Field(default=10.0)
    phase_lock: bool = Field(default=True)
    phase_speed: float = Field(default=1.0)
    easing_type: str = Field(default="sin")

    # Lighting
    light_dir: tuple = Field(default=(0.0, -1.0))
    ambient: float = Field(default=0.4)

    # Rendering
    palette: str = Field(default="aurora")
    symmetry_gradient: bool = Field(default=True)
    bloom_intensity: float = Field(default=0.3)


def get_schema() -> ParamSchema:
    """Get parameter schema."""
    return ParamSchema(
        name="ritual_diagrams",
        description="Sacred geometry patterns with radial symmetry and phase-locked animation",
        params=[
            IntParam("num_shapes", 1, 50, 10, path="geom.sdf.num_shapes"),
            FloatParam("shape_scale", 0.05, 0.5, 0.15, path="geom.sdf.shape_scale"),
            ChoiceParam("primitive_types", ["circle", "box", "star", "both"], default="circle", path="geom.sdf.primitive_types"),
            BoolParam("radial_symmetry", True, path="composition.symmetry.radial"),
            IntParam("fold_count", 2, 16, 6, path="composition.symmetry.fold_count"),
            Vec2Param("symmetry_center", (0.0, 0.0), (1.0, 1.0), (0.5, 0.5), path="composition.symmetry.center"),
            BoolParam("anim_enabled", True, path="anim.enabled"),
            IntParam("fps", 1, 60, 30, path="anim.fps"),
            FloatParam("duration", 1.0, 60.0, 10.0, path="anim.duration"),
            BoolParam("phase_lock", True, path="anim.phase_lock"),
            FloatParam("phase_speed", 0.1, 10.0, 1.0, path="anim.phase_speed"),
            ChoiceParam("easing_type", ["linear", "sin", "cos"], default="sin", path="anim.easing.type"),
            Vec2Param("light_dir", (-1.0, -1.0), (1.0, 1.0), (0.0, -1.0), path="composition.lighting.direction"),
            FloatParam("ambient", 0.0, 1.0, 0.4, path="composition.lighting.ambient"),
            ColorParam("palette", "aurora", path="color.palette"),
            BoolParam("symmetry_gradient", True, path="color.symmetry.gradient"),
            FloatParam("bloom_intensity", 0.0, 1.0, 0.3, path="post.bloom.intensity"),
        ],
    )


def defaults() -> dict:
    """Get default values."""
    config = RitualDiagramsConfig()
    return config.model_dump()


def render(config: RitualDiagramsConfig, ctx: RenderContext) -> "RenderResult":
    """Render ritual diagrams."""
    from numbrane_python.core.render_result import RenderResult
    from numbrane_python.render.canvas import Canvas
    from numbrane_python.render.draw import draw_circle, draw_polyline
    from numbrane_python.render.palettes import get_palette, gradient_map
    from numbrane_python.render.postfx import apply_bloom
    from numbrane_python.fields.scalar import NoiseField
    import numpy as np

    canvas = Canvas(ctx.width, ctx.height, 3)

    # Compute phase for animation
    if config.anim_enabled:
        phase = ctx.time * config.phase_speed * 2 * np.pi
        if config.easing_type == "sin":
            phase = np.sin(phase)
        elif config.easing_type == "cos":
            phase = np.cos(phase)
    else:
        phase = 0.0

    # Symmetry center
    center_x = config.symmetry_center[0] * ctx.width
    center_y = config.symmetry_center[1] * ctx.height

    # Generate SDF shapes with radial symmetry
    rng = ctx.rng.generator
    y, x = np.ogrid[:ctx.height, :ctx.width]
    x_rel = x - center_x
    y_rel = y - center_y

    # Apply radial symmetry
    if config.radial_symmetry:
        angle = np.arctan2(y_rel, x_rel)
        radius = np.sqrt(x_rel**2 + y_rel**2)
        # Fold into one sector
        sector_angle = 2 * np.pi / config.fold_count
        folded_angle = angle % sector_angle
        # Unfold
        x_sym = radius * np.cos(folded_angle)
        y_sym = radius * np.sin(folded_angle)
    else:
        x_sym = x_rel
        y_sym = y_rel

    # Normalize coordinates
    max_dist = np.sqrt(ctx.width**2 + ctx.height**2) / 2
    x_norm = x_sym / max_dist
    y_norm = y_sym / max_dist

    coords = np.stack([x_norm, y_norm], axis=-1)

    # Generate SDF shapes
    sdf = np.full((ctx.height, ctx.width), np.inf)
    shapes = []

    for _ in range(config.num_shapes):
        if config.primitive_types in ["circle", "both"]:
            center = np.array([
                rng.uniform(-0.6, 0.6),
                rng.uniform(-0.6, 0.6),
            ])
            radius = rng.uniform(0.05, 0.2) * config.shape_scale
            dist = np.linalg.norm(coords - center, axis=-1) - radius
            sdf = np.minimum(sdf, dist)
            shapes.append(('circle', center, radius))

        if config.primitive_types in ["box", "both"]:
            center = np.array([
                rng.uniform(-0.6, 0.6),
                rng.uniform(-0.6, 0.6),
            ])
            size = np.array([rng.uniform(0.05, 0.2), rng.uniform(0.05, 0.2)]) * config.shape_scale
            d = np.abs(coords - center) - size
            dist = np.linalg.norm(np.maximum(d, 0), axis=-1) + np.minimum(np.max(d, axis=-1), 0)
            sdf = np.minimum(sdf, dist)
            shapes.append(('box', center, size))

    # Add phase-based animation
    sdf += np.sin(phase) * 0.05

    # Compute lighting
    light_dir = np.array(config.light_dir)
    light_dir = light_dir / (np.linalg.norm(light_dir) + 1e-6)
    normal_x = np.gradient(sdf, axis=1)
    normal_y = np.gradient(sdf, axis=0)
    norm = np.sqrt(normal_x**2 + normal_y**2 + 1e-6)
    normal_x /= norm
    normal_y /= norm
    dot = normal_x * light_dir[0] + normal_y * light_dir[1]
    lighting = config.ambient + (1.0 - config.ambient) * np.maximum(0, dot)

    # Render SDF
    palette = get_palette(config.palette)
    sdf_layer = canvas.create_layer("sdf")
    sdf_mask = sdf < 0.02

    if config.symmetry_gradient:
        # Gradient based on distance from center
        dist_from_center = np.sqrt(x_rel**2 + y_rel**2) / max_dist
        gradient = 1.0 - dist_from_center
        colors = gradient_map(lighting * gradient, palette)
    else:
        colors = gradient_map(lighting, palette)

    sdf_layer[sdf_mask] = colors[sdf_mask]

    # Add hatching for detail
    if config.radial_symmetry:
        hatching_layer = canvas.create_layer("hatching")
        for i in range(config.fold_count):
            angle = i * 2 * np.pi / config.fold_count
            # Draw radial lines
            for r in np.linspace(0.2, 0.8, 10):
                x1 = center_x + r * max_dist * np.cos(angle)
                y1 = center_y + r * max_dist * np.sin(angle)
                x2 = center_x + (r + 0.1) * max_dist * np.cos(angle)
                y2 = center_y + (r + 0.1) * max_dist * np.sin(angle)
                if 0 <= x1 < ctx.width and 0 <= y1 < ctx.height:
                    from numbrane_python.render.draw import draw_line
                    draw_line(hatching_layer, (x1, y1), (x2, y2), 0.5, (100, 100, 100))

    # Add starfield background
    bg_layer = canvas.create_layer("background")
    noise_field = NoiseField(scale=0.1, seed=ctx.rng.seed)
    noise = noise_field.sample(x_norm, y_norm)
    stars = noise > 0.7
    bg_layer[stars] = palette[-1]

    # Composite
    image = canvas.get_image()

    # Apply bloom
    if config.bloom_intensity > 0:
        image = apply_bloom(image, config.bloom_intensity)

    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="ritual_diagrams",
        config=config,
    )


def presets() -> dict:
    """Return curated presets."""
    return {
        "sacred_mandala": {
            "fold_count": 12,
            "phase_lock": True,
            "palette": "aurora",
            "bloom_intensity": 0.5,
        },
        "minimal_ritual": {
            "fold_count": 4,
            "num_shapes": 3,
            "palette": "void",
        },
        "hypnotic_spiral": {
            "phase_speed": 3.0,
            "easing_type": "sin",
            "palette": "cosmic",
        },
    }
