"""Voronoi stained glass sketch."""

import numpy as np
from pydantic import BaseModel, Field
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult
from numbrane_python.fields.scalar import NoiseField
from numbrane_python.render.canvas import Canvas
from numbrane_python.render.palettes import get_palette, gradient_map
from numbrane_python.render.postfx import apply_vignette, apply_bloom
from numbrane_python.render.draw import draw_line


class VoronoiStainedGlassConfig(BaseModel):
    """Configuration for Voronoi stained glass sketch."""

    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # Voronoi parameters
    voronoi_scale: float = Field(default=0.02, description="Voronoi cell scale")
    num_points: int = Field(default=50, description="Number of Voronoi points")
    edge_width: float = Field(default=2.0, description="Edge line width")
    edge_color: tuple = Field(default=(0, 0, 0), description="Edge color (R, G, B)")

    # Stylization
    palette: str = Field(default="void", description="Color palette")
    noise_scale: float = Field(default=0.01, description="Noise scale for variation")
    warp_strength: float = Field(default=0.2, description="Domain warp strength")

    # Post-processing
    bloom_intensity: float = Field(default=0.3, description="Bloom intensity")
    vignette_strength: float = Field(default=0.2, description="Vignette strength")


def render(config: VoronoiStainedGlassConfig, ctx: RenderContext) -> RenderResult:
    """Render Voronoi stained glass."""
    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    # Create coordinate grids
    y, x = np.ogrid[: ctx.height, : ctx.width]
    x_norm = x / ctx.width
    y_norm = y / ctx.height
    coords = np.stack([x_norm, y_norm], axis=-1)

    # Generate Voronoi points
    rng = ctx.rng.generator
    points = np.array([[rng.uniform(0, 1), rng.uniform(0, 1)] for _ in range(config.num_points)])

    # Compute Voronoi diagram (simplified - distance to nearest point)
    voronoi = np.zeros((ctx.height, ctx.width))
    cell_ids = np.zeros((ctx.height, ctx.width), dtype=int)

    for i in range(ctx.height):
        for j in range(ctx.width):
            dists = np.sqrt((x_norm[i, j] - points[:, 0]) ** 2 + (y_norm[i, j] - points[:, 1]) ** 2)
            nearest = np.argmin(dists)
            voronoi[i, j] = dists[nearest]
            cell_ids[i, j] = nearest

    # Add noise variation
    noise_field = NoiseField(scale=config.noise_scale, seed=ctx.rng.seed)
    noise = noise_field.sample(x_norm, y_norm)
    voronoi += noise * 0.1

    # Map to colors
    palette_colors = get_palette(config.palette)
    colors = gradient_map(voronoi, palette_colors)
    layer[:] = colors

    # Draw edges (simplified - detect boundaries)
    edge_layer = canvas.create_layer("edges")
    for i in range(1, ctx.height - 1):
        for j in range(1, ctx.width - 1):
            if (
                cell_ids[i, j] != cell_ids[i - 1, j]
                or cell_ids[i, j] != cell_ids[i + 1, j]
                or cell_ids[i, j] != cell_ids[i, j - 1]
                or cell_ids[i, j] != cell_ids[i, j + 1]
            ):
                # Edge detected
                draw_line(
                    edge_layer,
                    (j, i),
                    (j, i),
                    config.edge_width,
                    np.array(config.edge_color, dtype=np.uint8),
                )

    # Composite
    image = canvas.composite_layers(["main", "edges"])

    # Post-processing
    if config.bloom_intensity > 0:
        image = apply_bloom(image, intensity=config.bloom_intensity)
    if config.vignette_strength > 0:
        image = apply_vignette(image, config.vignette_strength)

    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="voronoi_stained_glass",
        config=config,
    )


def param_space():
    """Define parameter space."""
    from numbrane_python.paramspace import ParamSpace, FloatParam, IntParam, ColorParam

    return ParamSpace(
        params=[
            FloatParam("voronoi_scale", 0.005, 0.1, 0.02, description="Voronoi cell scale"),
            IntParam("num_points", 20, 200, 50, description="Number of Voronoi points"),
            FloatParam("edge_width", 0.5, 5.0, 2.0, description="Edge line width"),
            ColorParam("palette", "void", description="Color palette"),
            FloatParam("noise_scale", 0.001, 0.05, 0.01, description="Noise scale"),
            FloatParam("warp_strength", 0.0, 0.5, 0.2, description="Domain warp strength"),
            FloatParam("bloom_intensity", 0.0, 0.8, 0.3, description="Bloom intensity"),
        ],
    )


def presets() -> dict:
    """Return curated presets."""
    return {
        "dense": {"num_points": 150, "voronoi_scale": 0.01},
        "sparse": {"num_points": 30, "voronoi_scale": 0.05},
        "colorful": {"palette": "sunset", "bloom_intensity": 0.5},
    }
