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

    # Tile parameters (algorithm)
    tile_size: int = Field(default=40, description="Tile size in pixels")
    tile_set: str = Field(default="curves", description="Tile set (curves, arcs, maze)")
    perturbation: float = Field(default=0.1, description="Perturbation strength")

    # Composition — tile layout / orientation
    tile_scale: float = Field(
        default=1.0, ge=0.5, le=2.5, description="Global tile scale multiplier"
    )
    orientation_bias: float = Field(
        default=0.0,
        ge=-1.0,
        le=1.0,
        description="Bias toward alternating orientations",
    )
    field_driven_orientation: bool = Field(
        default=False,
        description="Let scalar field steer tile pattern choice",
    )
    pattern_continuity: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Neighbor-aware pattern continuity (1 = strong)",
    )

    # Stylization / style
    line_width: float = Field(default=2.0, description="Line width")
    palette: str = Field(default="ink", description="Color palette")
    background_color: tuple = Field(default=(0, 0, 0), description="Background color (legacy)")
    background: str = Field(default="", description="Intentional background token")
    pfl_style: str = Field(default="", description="PFL art-direction preset id")

    # Noise for perturbation (algorithm)
    noise_scale: float = Field(default=0.1, description="Noise scale for perturbation")


def render(config: TruchetTilesConfig, ctx: RenderContext) -> RenderResult:
    """Render Truchet tiles."""
    from numbrane_python.composition.grammar import background_rgb
    from numbrane_python.style.pfl import apply_style_to_params

    if config.pfl_style:
        raw = apply_style_to_params(config.pfl_style, config.model_dump())
        config = config.model_copy(
            update={k: raw[k] for k in ("palette", "background") if k in raw}
        )

    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    if config.background:
        layer[:] = np.array(background_rgb(config.background), dtype=np.uint8)
    else:
        layer[:] = np.array(config.background_color, dtype=np.uint8)

    noise_field = NoiseField(scale=config.noise_scale, seed=ctx.rng.seed)
    orient_field = NoiseField(scale=config.noise_scale * 0.7, seed=ctx.rng.seed + 17)

    rng = np.random.default_rng(int(config.seed) & 0xFFFFFFFF)
    palette_colors = get_palette(config.palette)
    fg = palette_colors[-1] if len(palette_colors) > 1 else (220, 220, 230)
    color = np.array(fg, dtype=np.uint8)

    base_tile = max(12, int(config.tile_size + (int(config.seed) % 17) - 8))
    tile_size = max(8, int(base_tile * config.tile_scale))
    num_tiles_x = ctx.width // tile_size + 1
    num_tiles_y = ctx.height // tile_size + 1
    prev_pattern = 0

    for ty in range(num_tiles_y):
        for tx in range(num_tiles_x):
            tile_x = tx * tile_size
            tile_y = ty * tile_size

            if config.field_driven_orientation:
                field_val = orient_field.sample(
                    np.array([tile_x / ctx.width]),
                    np.array([tile_y / ctx.height]),
                )[0]
                pattern = int((field_val + 1) * 2) % 4
            else:
                pattern = int(rng.integers(0, 4))

            if config.orientation_bias != 0.0:
                if (tx + ty) % 2 == 0:
                    pattern = (pattern + int(config.orientation_bias > 0)) % 4
                else:
                    pattern = (pattern + int(config.orientation_bias < 0)) % 4

            if config.pattern_continuity > 0 and tx + ty > 0:
                blend = float(config.pattern_continuity)
                if blend >= 0.5:
                    pattern = int(round(prev_pattern * blend + pattern * (1.0 - blend))) % 4
                else:
                    pattern = prev_pattern if rng.random() < blend else pattern
            prev_pattern = pattern

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

            center_x = tile_x + tile_size / 2
            center_y = tile_y + tile_size / 2
            half = tile_size / 2

            if pattern == 0:
                points = []
                for i in range(20):
                    t = i / 19.0
                    angle = t * np.pi / 2
                    px = center_x - half + half * np.cos(angle)
                    py = center_y - half + half * np.sin(angle)
                    points.append([px, py])
                draw_polyline(layer, np.array(points), config.line_width, color)
            elif pattern == 1:
                points = []
                for i in range(20):
                    t = i / 19.0
                    angle = np.pi / 2 + t * np.pi / 2
                    px = center_x + half - half * np.cos(angle)
                    py = center_y - half + half * np.sin(angle)
                    points.append([px, py])
                draw_polyline(layer, np.array(points), config.line_width, color)
            elif pattern == 2:
                draw_line(
                    layer,
                    (tile_x, tile_y),
                    (tile_x + tile_size, tile_y + tile_size),
                    config.line_width,
                    color,
                )
            else:
                draw_line(
                    layer,
                    (tile_x + tile_size, tile_y),
                    (tile_x, tile_y + tile_size),
                    config.line_width,
                    color,
                )

    image = canvas.get_image()
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
            "pattern_continuity": 0.85,
        },
        "flowing_curves": {
            "tile_size": 60,
            "tile_set": "curves",
            "perturbation": 0.2,
            "line_width": 3.0,
            "field_driven_orientation": True,
        },
    }
