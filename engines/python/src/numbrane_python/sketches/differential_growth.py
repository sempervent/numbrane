"""Differential growth / venation sketch."""

import numpy as np
from pydantic import BaseModel, Field
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult
from numbrane_python.render.canvas import Canvas
from numbrane_python.render.draw import draw_polyline
from numbrane_python.render.palettes import get_palette
from numbrane_python.render.postfx import apply_vignette, apply_bloom


class DifferentialGrowthConfig(BaseModel):
    """Configuration for differential growth sketch."""

    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # Growth parameters
    num_seeds: int = Field(default=5, description="Number of seed points")
    growth_rate: float = Field(default=0.5, description="Growth rate per step")
    branch_angle: float = Field(default=45.0, description="Branching angle (degrees)")
    branch_prob: float = Field(default=0.02, description="Branching probability")
    max_length: float = Field(default=500.0, description="Maximum segment length")

    # Venation parameters
    vein_thickness: float = Field(default=2.0, description="Base vein thickness")
    thickness_variation: float = Field(default=0.5, description="Thickness variation")
    nutrient_diffusion: float = Field(default=0.1, description="Nutrient diffusion rate")

    # Rendering
    palette: str = Field(default="void", description="Color palette")
    stroke_width: float = Field(default=1.5, description="Stroke width")
    background_color: tuple = Field(default=(0, 0, 0), description="Background color")


def render(config: DifferentialGrowthConfig, ctx: RenderContext) -> RenderResult:
    """Render differential growth."""
    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    # Initialize background
    layer[:] = np.array(config.background_color, dtype=np.uint8)

    # Initialize growth structure
    rng = ctx.rng.generator

    # Seed points
    seeds = []
    for _ in range(config.num_seeds):
        seeds.append(
            [
                rng.uniform(0, ctx.width),
                rng.uniform(0, ctx.height),
            ]
        )

    # Growth structure: list of segments (start, end, thickness, age)
    segments = []
    for seed in seeds:
        # Initial segment
        angle = rng.uniform(0, 2 * np.pi)
        length = rng.uniform(10, 30)
        end = [
            seed[0] + np.cos(angle) * length,
            seed[1] + np.sin(angle) * length,
        ]
        segments.append(
            {
                "start": seed,
                "end": end,
                "thickness": config.vein_thickness,
                "age": 0,
            }
        )

    # Growth simulation
    max_steps = 500
    palette_colors = get_palette(config.palette)

    for step in range(max_steps):
        new_segments = []

        for seg in segments:
            if seg["age"] > max_steps:
                continue

            # Grow segment
            dx = seg["end"][0] - seg["start"][0]
            dy = seg["end"][1] - seg["start"][1]
            length = np.sqrt(dx**2 + dy**2)

            if length < config.max_length:
                # Extend
                angle = np.arctan2(dy, dx)
                growth = config.growth_rate * (1.0 - length / config.max_length)
                new_end = [
                    seg["end"][0] + np.cos(angle) * growth,
                    seg["end"][1] + np.sin(angle) * growth,
                ]

                # Clamp to bounds
                new_end[0] = np.clip(new_end[0], 0, ctx.width)
                new_end[1] = np.clip(new_end[1], 0, ctx.height)

                seg["end"] = new_end
                seg["age"] += 1

                # Branching
                if rng.random() < config.branch_prob and length > 20:
                    branch_angle = angle + np.deg2rad(
                        rng.uniform(-config.branch_angle, config.branch_angle)
                    )
                    branch_length = rng.uniform(5, 15)
                    branch_end = [
                        seg["end"][0] + np.cos(branch_angle) * branch_length,
                        seg["end"][1] + np.sin(branch_angle) * branch_length,
                    ]
                    branch_end[0] = np.clip(branch_end[0], 0, ctx.width)
                    branch_end[1] = np.clip(branch_end[1], 0, ctx.height)

                    new_segments.append(
                        {
                            "start": seg["end"].copy(),
                            "end": branch_end,
                            "thickness": seg["thickness"] * rng.uniform(0.7, 0.9),
                            "age": 0,
                        }
                    )

        segments.extend(new_segments)

    # Draw segments
    for seg in segments:
        # Thickness-based color
        thickness_norm = (seg["thickness"] - config.vein_thickness * 0.5) / (
            config.vein_thickness * 2
        )
        color_idx = int(np.clip(thickness_norm * len(palette_colors), 0, len(palette_colors) - 1))
        color = np.array(palette_colors[color_idx], dtype=np.uint8)

        width = seg["thickness"] * (1.0 + config.thickness_variation * rng.uniform(-1, 1))

        draw_polyline(
            layer,
            np.array([seg["start"], seg["end"]]),
            width,
            color,
            antialias=True,
        )

    image = canvas.get_image()

    # Post-processing
    image = apply_vignette(image, 0.3)
    image = apply_bloom(image, intensity=0.2)

    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="differential_growth",
        config=config,
    )


def get_schema():
    """Get parameter schema."""
    from numbrane_python.params.schema import ParamSchema
    from numbrane_python.params.types import (
        IntParam,
        FloatParam,
        ColorParam,
    )

    return ParamSchema(
        name="differential_growth",
        description="Differential growth / venation patterns",
        params=[
            IntParam("num_seeds", 1, 20, 5, path="growth.num_seeds"),
            FloatParam("growth_rate", 0.1, 2.0, 0.5, path="growth.rate"),
            FloatParam("branch_angle", 10.0, 90.0, 45.0, path="growth.branch_angle"),
            FloatParam("branch_prob", 0.0, 0.1, 0.02, path="growth.branch_prob"),
            FloatParam("max_length", 100.0, 1000.0, 500.0, path="growth.max_length"),
            FloatParam("vein_thickness", 0.5, 5.0, 2.0, path="geom.vein_thickness"),
            FloatParam("thickness_variation", 0.0, 1.0, 0.5, path="geom.thickness_variation"),
            ColorParam("palette", "void", path="color.palette"),
        ],
    )


def defaults() -> dict:
    """Get default values."""
    config = DifferentialGrowthConfig()
    return config.model_dump()


def presets() -> dict:
    """Return curated presets."""
    return {
        "dense_web": {
            "num_seeds": 10,
            "growth_rate": 0.8,
            "branch_prob": 0.05,
            "max_length": 300.0,
        },
        "sparse_tendrils": {
            "num_seeds": 3,
            "growth_rate": 0.3,
            "branch_prob": 0.01,
            "max_length": 800.0,
        },
        "void_tendrils": {
            "num_seeds": 5,
            "growth_rate": 0.5,
            "branch_angle": 60.0,
            "palette": "void",
            "vein_thickness": 1.5,
        },
    }
