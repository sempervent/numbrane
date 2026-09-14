from __future__ import annotations

"""Attractor calligraphy - schema definition."""

from pydantic import BaseModel, Field
from numbrane_python.params.schema import ParamSchema
from numbrane_python.params.types import (
    IntParam, FloatParam, BoolParam, ChoiceParam, ColorParam, AngleParam,
)
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult


class AttractorCalligraphyConfig(BaseModel):
    """Configuration for attractor calligraphy sketch."""
    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # Attractor parameters
    attractor_type: str = Field(default="lorenz")
    lorenz_sigma: float = Field(default=10.0)
    lorenz_rho: float = Field(default=28.0)
    lorenz_beta: float = Field(default=8.0/3.0)

    # Simulation
    steps: int = Field(default=100000)
    dt: float = Field(default=0.01)
    burn_in: int = Field(default=1000)

    # Projection
    projection: str = Field(default="xy")

    # Stroke parameters
    stroke_width: float = Field(default=2.0)
    stroke_taper: float = Field(default=0.3)
    ink_pooling: bool = Field(default=True)
    pooling_threshold: float = Field(default=0.5)
    pooling_radius: float = Field(default=5.0)

    # Rendering
    palette: str = Field(default="void")
    ink_opacity: float = Field(default=0.8)
    density_scale: float = Field(default=1.0)


def get_schema() -> ParamSchema:
    """Get parameter schema."""
    return ParamSchema(
        name="attractor_calligraphy",
        description="Strange attractor trajectories rendered as calligraphic strokes",
        params=[
            ChoiceParam("attractor_type", ["lorenz", "rossler", "clifford"], default="lorenz", path="sim.attractor.type"),
            FloatParam("lorenz_sigma", 1.0, 20.0, 10.0, path="sim.attractor.lorenz.sigma"),
            FloatParam("lorenz_rho", 10.0, 50.0, 28.0, path="sim.attractor.lorenz.rho"),
            FloatParam("lorenz_beta", 1.0, 5.0, 8.0/3.0, path="sim.attractor.lorenz.beta"),
            IntParam("steps", 10000, 500000, 100000, path="sim.steps"),
            FloatParam("dt", 0.001, 0.1, 0.01, path="sim.dt"),
            IntParam("burn_in", 0, 5000, 1000, path="sim.burn_in"),
            ChoiceParam("projection", ["xy", "xz", "yz"], default="xy", path="composition.projection"),
            FloatParam("stroke_width", 0.5, 10.0, 2.0, path="geom.stroke.width"),
            FloatParam("stroke_taper", 0.0, 1.0, 0.3, path="geom.stroke.taper"),
            BoolParam("ink_pooling", True, path="geom.stroke.ink_pooling"),
            FloatParam("pooling_threshold", 0.0, 1.0, 0.5, path="geom.stroke.pooling_threshold"),
            FloatParam("pooling_radius", 1.0, 20.0, 5.0, path="geom.stroke.pooling_radius"),
            ColorParam("palette", "void", path="color.palette"),
            FloatParam("ink_opacity", 0.1, 1.0, 0.8, path="color.ink.opacity"),
            FloatParam("density_scale", 0.5, 2.0, 1.0, path="composition.density.scale"),
        ],
    )


def defaults() -> dict:
    """Get default values."""
    config = AttractorCalligraphyConfig()
    return config.model_dump()


def render(config: AttractorCalligraphyConfig, ctx: RenderContext) -> "RenderResult":
    """Render attractor calligraphy."""
    from numbrane_python.core.render_result import RenderResult
    from numbrane_python.render.canvas import Canvas
    from numbrane_python.render.draw import draw_polyline
    from numbrane_python.render.palettes import get_palette
    from numbrane_python.render.postfx import apply_film_grain
    import numpy as np

    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    # Initialize attractor state
    rng = ctx.rng.generator
    if config.attractor_type == "lorenz":
        x, y, z = 1.0, 1.0, 1.0
    elif config.attractor_type == "rossler":
        x, y, z = 0.0, 0.0, 0.0
    else:  # clifford
        x, y = 0.0, 0.0

    # Store trajectory points
    trajectory = []
    speeds = []

    # Integration
    for i in range(config.steps + config.burn_in):
        # Integrate
        if config.attractor_type == "lorenz":
            dx = config.lorenz_sigma * (y - x)
            dy = x * (config.lorenz_rho - z) - y
            dz = x * y - config.lorenz_beta * z
            x += dx * config.dt
            y += dy * config.dt
            z += dz * config.dt
        elif config.attractor_type == "rossler":
            dx = -(y + z)
            dy = x + 0.2 * y
            dz = 0.2 + z * (x - 5.7)
            x += dx * config.dt
            y += dy * config.dt
            z += dz * config.dt
        else:  # clifford
            x_new = np.sin(-1.4 * y) + 1.0 * np.cos(-1.4 * x)
            y_new = np.sin(1.6 * x) + 0.7 * np.cos(1.6 * y)
            x, y = x_new, y_new

        # Skip burn-in
        if i < config.burn_in:
            continue

        # Project to 2D
        if config.attractor_type == "clifford":
            px, py = x, y
        elif config.projection == "xy":
            px, py = x, y
        elif config.projection == "xz":
            px, py = x, z
        else:  # yz
            px, py = y, z

        # Normalize and map to canvas
        # Scale to fit canvas
        scale = min(ctx.width, ctx.height) / 4.0
        screen_x = px * scale + ctx.width / 2
        screen_y = py * scale + ctx.height / 2

        trajectory.append((screen_x, screen_y))

        # Compute speed (for stroke width)
        if len(trajectory) > 1:
            speed = np.linalg.norm(np.array(trajectory[-1]) - np.array(trajectory[-2]))
            speeds.append(speed)
        else:
            speeds.append(1.0)

    # Render as calligraphic strokes
    palette = get_palette(config.palette)

    # Group trajectory into strokes
    strokes = []
    current_stroke = []
    for i, (px, py) in enumerate(trajectory):
        if 0 <= px < ctx.width and 0 <= py < ctx.height:
            current_stroke.append((px, py))
        else:
            if len(current_stroke) > 1:
                strokes.append(current_stroke)
            current_stroke = []
    if len(current_stroke) > 1:
        strokes.append(current_stroke)

    # Draw strokes with variable width
    for stroke in strokes:
        if len(stroke) < 2:
            continue

        # Compute stroke widths based on speed/curvature
        widths = []
        for i in range(len(stroke)):
            if i < len(speeds):
                speed = speeds[i]
                # Width inversely proportional to speed (slower = thicker)
                width = config.stroke_width * (1.0 + (1.0 - speed / max(speeds)) * config.stroke_taper)
            else:
                width = config.stroke_width
            widths.append(max(0.5, width))

        # Apply ink pooling at slow points
        if config.ink_pooling:
            for i in range(1, len(stroke) - 1):
                if i < len(speeds) and speeds[i] < config.pooling_threshold:
                    # Draw pooling circle
                    from numbrane_python.render.draw import draw_circle
                    pool_color = palette[1 % len(palette)]
                    draw_circle(canvas, stroke[i][0], stroke[i][1], config.pooling_radius, pool_color)

        # Draw stroke
        color = palette[0]
        for i in range(len(stroke) - 1):
            width = (widths[i] + widths[i+1]) / 2
            draw_polyline(canvas, [stroke[i], stroke[i+1]], width, color)

    # Apply post-processing
    image = canvas.composite()
    if config.density_scale != 1.0:
        # Adjust density (simplified)
        image = (image * config.density_scale).clip(0, 255).astype(np.uint8)

    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="attractor_calligraphy",
        config=config,
    )


def presets() -> dict:
    """Return curated presets."""
    return {
        "elegant_script": {
            "attractor_type": "lorenz",
            "stroke_taper": 0.5,
            "ink_pooling": True,
            "palette": "earth",
        },
        "chaotic_scribble": {
            "attractor_type": "clifford",
            "stroke_taper": 0.1,
            "density_scale": 1.5,
            "palette": "void",
        },
        "minimal_traces": {
            "steps": 50000,
            "stroke_taper": 0.8,
            "ink_pooling": False,
        },
    }
