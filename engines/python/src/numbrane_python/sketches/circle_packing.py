"""Circle packing sketch."""

import numpy as np
from pydantic import BaseModel, Field
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult
from numbrane_python.render.canvas import Canvas
from numbrane_python.render.draw import draw_point
from numbrane_python.render.palettes import get_palette
from numbrane_python.render.postfx import apply_vignette


class CirclePackingConfig(BaseModel):
    """Configuration for circle packing sketch."""

    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # Packing parameters
    min_radius: float = Field(default=5.0, description="Minimum circle radius")
    max_radius: float = Field(default=50.0, description="Maximum circle radius")
    num_attempts: int = Field(default=10000, description="Number of placement attempts")
    min_distance: float = Field(default=2.0, description="Minimum distance between circles")

    # Rendering
    palette: str = Field(default="void", description="Color palette")
    fill_circles: bool = Field(default=True, description="Fill circles")
    stroke_width: float = Field(default=1.0, description="Stroke width")

    # Shading
    shading_strength: float = Field(default=0.5, description="Shading strength")
    light_direction: tuple = Field(default=(0.5, -0.5), description="Light direction")


def render(config: CirclePackingConfig, ctx: RenderContext) -> RenderResult:
    """Render circle packing."""
    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    # Initialize background
    palette_colors = get_palette(config.palette)
    bg_color = np.array(palette_colors[0], dtype=np.uint8)
    layer[:] = bg_color

    # Circle packing algorithm (simplified Poisson disk)
    circles = []
    rng = ctx.rng.generator

    for attempt in range(config.num_attempts):
        # Try to place a circle
        x = rng.uniform(0, ctx.width)
        y = rng.uniform(0, ctx.height)
        radius = rng.uniform(config.min_radius, config.max_radius)

        # Check collision
        valid = True
        for cx, cy, cr in circles:
            dist = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            if dist < (radius + cr + config.min_distance):
                valid = False
                break

        if valid:
            circles.append((x, y, radius))

    # Draw circles
    for i, (cx, cy, radius) in enumerate(circles):
        # Color based on radius or index
        color_idx = int(
            (radius - config.min_radius)
            / (config.max_radius - config.min_radius)
            * (len(palette_colors) - 1)
        )
        color_idx = np.clip(color_idx, 0, len(palette_colors) - 1)
        color = np.array(palette_colors[color_idx], dtype=np.uint8)

        # Apply shading
        if config.shading_strength > 0:
            # Simple shading based on position
            light_dir = np.array(config.light_direction)
            light_dir = light_dir / (np.linalg.norm(light_dir) + 1e-6)

            # Normal from center
            center = np.array([ctx.width / 2, ctx.height / 2])
            pos = np.array([cx, cy])
            to_center = pos - center
            if np.linalg.norm(to_center) > 0:
                normal = to_center / np.linalg.norm(to_center)
            else:
                normal = np.array([0, 1])

            dot = np.dot(normal, light_dir)
            shade = 0.5 + config.shading_strength * dot
            color = (color * np.clip(shade, 0.3, 1.0)).astype(np.uint8)

        # Draw circle
        draw_point(layer, (cx, cy), radius, color, antialias=True)

    image = canvas.get_image()

    # Post-processing
    if config.vignette_strength > 0:
        image = apply_vignette(image, config.vignette_strength)

    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="circle_packing",
        config=config,
    )


def param_space():
    """Define parameter space."""
    from numbrane_python.paramspace import (
        ParamSpace,
        FloatParam,
        IntParam,
        BoolParam,
        ColorParam,
    )

    return ParamSpace(
        params=[
            FloatParam("min_radius", 2.0, 20.0, 5.0, description="Minimum radius"),
            FloatParam("max_radius", 20.0, 100.0, 50.0, description="Maximum radius"),
            IntParam("num_attempts", 1000, 50000, 10000, description="Placement attempts"),
            FloatParam("min_distance", 0.0, 10.0, 2.0, description="Minimum distance"),
            ColorParam("palette", "void", description="Color palette"),
            BoolParam("fill_circles", True, description="Fill circles"),
            FloatParam("shading_strength", 0.0, 1.0, 0.5, description="Shading strength"),
        ],
    )


def presets() -> dict:
    """Return curated presets."""
    return {
        "dense": {"num_attempts": 30000, "min_radius": 3.0, "max_radius": 30.0},
        "sparse": {"num_attempts": 5000, "min_radius": 10.0, "max_radius": 80.0},
        "colorful": {"palette": "sunset", "shading_strength": 0.8},
    }
