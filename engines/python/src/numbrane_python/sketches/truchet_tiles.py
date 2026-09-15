"""Truchet tiles sketch."""

import numpy as np
from pydantic import BaseModel, Field
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult
from numbrane_python.fields.scalar import NoiseField
from numbrane_python.render.canvas import Canvas
from numbrane_python.render.draw import draw_polyline, draw_line
from numbrane_python.render.palettes import get_palette
from numbrane_python.render.postfx import apply_vignette


class TruchetTilesConfig(BaseModel):
    """Configuration for Truchet tiles sketch."""

    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # Tile parameters
    tile_size: int = Field(default=40, description="Tile size in pixels")
    tile_set: str = Field(default="curves", description="Tile set (curves, arcs, maze)")
    perturbation: float = Field(default=0.1, description="Perturbation strength")

    # Stylization
    line_width: float = Field(default=2.0, description="Line width")
    palette: str = Field(default="ink", description="Color palette")
    background_color: tuple = Field(default=(0, 0, 0), description="Background color")

    # Noise for perturbation
    noise_scale: float = Field(default=0.1, description="Noise scale for perturbation")


def render(config: TruchetTilesConfig, ctx: RenderContext) -> RenderResult:
    """Render Truchet tiles."""
    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    # Initialize background
    layer[:] = np.array(config.background_color, dtype=np.uint8)

    # Create noise field for perturbation
    noise_field = NoiseField(scale=config.noise_scale, seed=ctx.rng.seed)

    rng = ctx.rng.generator
    palette_colors = get_palette(config.palette)
    # Foreground must contrast with background (void[0] is near-black)
    fg = palette_colors[-1] if len(palette_colors) > 1 else (220, 220, 230)
    color = np.array(fg, dtype=np.uint8)
    # Seed-sensitive tile size within a bounded range
    tile_size = max(12, int(config.tile_size + (int(config.seed) % 17) - 8))
    num_tiles_x = ctx.width // tile_size + 1
    num_tiles_y = ctx.height // tile_size + 1

    # Draw tiles
    for ty in range(num_tiles_y):
        for tx in range(num_tiles_x):
            tile_x = tx * tile_size
            tile_y = ty * tile_size

            # Choose tile pattern (simplified - 4 basic patterns)
            pattern = rng.integers(0, 4)

            # Add perturbation
            perturb_x = (
                noise_field.sample(
                    np.array([tile_x / ctx.width]),
                    np.array([tile_y / ctx.height]),
                )[0]
                * config.perturbation
                * tile_size
            )
            perturb_y = (
                noise_field.sample(
                    np.array([(tile_x + 17) / ctx.width]),
                    np.array([(tile_y + 31) / ctx.height]),
                )[0]
                * config.perturbation
                * tile_size
            )

            tile_x += perturb_x
            tile_y += perturb_y

            # Draw tile pattern
            center_x = tile_x + tile_size / 2
            center_y = tile_y + tile_size / 2
            half = tile_size / 2

            if pattern == 0:
                # Top-left to bottom-right curve
                points = []
                for i in range(20):
                    t = i / 19.0
                    angle = t * np.pi / 2
                    px = center_x - half + half * np.cos(angle)
                    py = center_y - half + half * np.sin(angle)
                    points.append([px, py])
                draw_polyline(layer, np.array(points), config.line_width, color)
            elif pattern == 1:
                # Top-right to bottom-left curve
                points = []
                for i in range(20):
                    t = i / 19.0
                    angle = np.pi / 2 + t * np.pi / 2
                    px = center_x + half - half * np.cos(angle)
                    py = center_y - half + half * np.sin(angle)
                    points.append([px, py])
                draw_polyline(layer, np.array(points), config.line_width, color)
            elif pattern == 2:
                # Diagonal line top-left to bottom-right
                draw_line(
                    layer,
                    (tile_x, tile_y),
                    (tile_x + tile_size, tile_y + tile_size),
                    config.line_width,
                    color,
                )
            else:
                # Diagonal line top-right to bottom-left
                draw_line(
                    layer,
                    (tile_x + tile_size, tile_y),
                    (tile_x, tile_y + tile_size),
                    config.line_width,
                    color,
                )

    image = canvas.get_image()

    # Post-processing
    image = apply_vignette(image, 0.2)

    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="truchet_tiles",
        config=config,
    )


def get_schema():
    """Get parameter schema."""
    from numbrane_python.params.schema import ParamSchema
    from numbrane_python.params.types import (
        IntParam,
        FloatParam,
        ChoiceParam,
        ColorParam,
    )

    return ParamSchema(
        name="truchet_tiles",
        description="Truchet tiles with perturbation",
        params=[
            IntParam("tile_size", 10, 200, 40, path="geom.tile_size"),
            ChoiceParam(
                "tile_set", ["curves", "arcs", "maze"], default="curves", path="geom.tile_set"
            ),
            FloatParam("perturbation", 0.0, 0.5, 0.1, path="composition.perturbation"),
            FloatParam("line_width", 0.5, 10.0, 2.0, path="stroke.width"),
            ColorParam("palette", "void", path="color.palette"),
            FloatParam("noise_scale", 0.01, 1.0, 0.1, path="field.scale"),
        ],
    )


def defaults() -> dict:
    """Get default values."""
    config = TruchetTilesConfig()
    return config.model_dump()


def presets() -> dict:
    """Return curated presets."""
    return {
        "dense_maze": {
            "tile_size": 20,
            "tile_set": "maze",
            "perturbation": 0.05,
        },
        "flowing_curves": {
            "tile_size": 60,
            "tile_set": "curves",
            "perturbation": 0.2,
            "line_width": 3.0,
        },
    }
