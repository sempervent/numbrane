"""Flow-field stipple/engraving sketch."""

import numpy as np
from pydantic import BaseModel, Field
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult
from numbrane_python.fields.scalar import NoiseField
from numbrane_python.fields.vector import GradientField
from numbrane_python.render.canvas import Canvas
from numbrane_python.render.draw import draw_line
from numbrane_python.render.palettes import get_palette


class FlowHatchingConfig(BaseModel):
    """Configuration for flow hatching sketch."""

    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # Field parameters
    field_scale: float = Field(default=0.02)
    field_octaves: int = Field(default=4)

    # Hatching parameters
    line_spacing: float = Field(default=5.0, description="Spacing between hatch lines")
    line_length: float = Field(default=20.0, description="Length of hatch lines")
    line_width: float = Field(default=1.0)

    # Rendering
    palette: str = Field(default="void")
    density: float = Field(default=1.0, description="Line density multiplier")


def render(config: FlowHatchingConfig, ctx: RenderContext) -> RenderResult:
    """Render flow hatching."""
    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    # Create scalar field
    scalar_field = NoiseField(
        scale=config.field_scale,
        octaves=config.field_octaves,
        seed=ctx.rng.seed,
    )

    # Create vector field from gradient
    vector_field = GradientField(scalar_field, strength=1.0)

    # Generate hatch lines
    palette_colors = get_palette(config.palette)
    color = np.array(palette_colors[0], dtype=np.uint8)

    rng = ctx.rng.generator
    num_lines = int(ctx.width * ctx.height / (config.line_spacing**2) * config.density)

    for _ in range(num_lines):
        # Random start position
        x = rng.uniform(0, ctx.width)
        y = rng.uniform(0, ctx.height)

        # Sample field gradient
        vx, vy = vector_field.sample(
            np.array([x / ctx.width]),
            np.array([y / ctx.height]),
        )

        # Normalize direction
        mag = np.sqrt(vx[0] ** 2 + vy[0] ** 2)
        if mag > 1e-6:
            vx_norm = vx[0] / mag
            vy_norm = vy[0] / mag
        else:
            angle = rng.uniform(0, 2 * np.pi)
            vx_norm = np.cos(angle)
            vy_norm = np.sin(angle)

        # Draw hatch line perpendicular to gradient
        perp_x = -vy_norm
        perp_y = vx_norm

        x1 = x + perp_x * config.line_length * 0.5
        y1 = y + perp_y * config.line_length * 0.5
        x2 = x - perp_x * config.line_length * 0.5
        y2 = y - perp_y * config.line_length * 0.5

        draw_line(layer, (x1, y1), (x2, y2), config.line_width, color)

    image = canvas.get_image()

    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="flow_hatching",
        config=config,
    )
