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
    line_spacing: float = Field(default=4.0, description="Spacing between hatch lines")
    line_length: float = Field(default=28.0, description="Length of hatch lines")
    line_width: float = Field(default=1.0)
    streamline_steps: int = Field(default=24, description="Integration steps per streamline")
    field_dependent_color: bool = Field(default=True)

    # Rendering
    palette: str = Field(default="ink")
    density: float = Field(default=1.15, description="Line density multiplier")
    paper_style: str = Field(default="warm-paper", description="dark | warm-paper | plotter")
    mask_margin: float = Field(default=0.06, description="Negative-space margin fraction")


def render(config: FlowHatchingConfig, ctx: RenderContext) -> RenderResult:
    """Render flow hatching."""
    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    # Paper background
    if config.paper_style == "warm-paper":
        layer[:] = (246, 240, 228)
        ink_base = np.array([32, 28, 26], dtype=np.float32)
    elif config.paper_style == "plotter":
        layer[:] = (255, 255, 255)
        ink_base = np.array([10, 10, 12], dtype=np.float32)
    else:
        layer[:] = (8, 10, 14)
        ink_base = np.array([210, 220, 230], dtype=np.float32)

    scalar_field = NoiseField(
        scale=config.field_scale,
        octaves=config.field_octaves,
        seed=ctx.rng.seed,
    )
    vector_field = GradientField(scalar_field, strength=1.0)
    palette_colors = get_palette(config.palette)
    rng = ctx.rng.generator
    # Cap offline populations — high-res art can still be dense without O(n²) blowups
    area = max(1, ctx.width * ctx.height)
    num_lines = int(area / (config.line_spacing**2) * config.density)
    num_lines = min(num_lines, 12_000 if area > 500_000 else 25_000)
    steps = min(int(config.streamline_steps), 32)
    margin = float(config.mask_margin)

    for _ in range(num_lines):
        x = rng.uniform(ctx.width * margin, ctx.width * (1 - margin))
        y = rng.uniform(ctx.height * margin, ctx.height * (1 - margin))
        # Skip sparse negative-space islands
        if rng.random() < 0.08:
            continue

        path_x, path_y = [x], [y]
        for _step in range(steps):
            vx, vy = vector_field.sample(
                np.array([path_x[-1] / ctx.width]),
                np.array([path_y[-1] / ctx.height]),
            )
            mag = float(np.sqrt(vx[0] ** 2 + vy[0] ** 2))
            if mag < 1e-6:
                break
            # Integrate along field (not only perpendicular hatch)
            step = config.line_length / max(steps, 1)
            nx = path_x[-1] + (vx[0] / mag) * step
            ny = path_y[-1] + (vy[0] / mag) * step
            if not (0 <= nx < ctx.width and 0 <= ny < ctx.height):
                break
            # Curvature filter: stop if direction flips hard
            if len(path_x) > 2:
                ax, ay = path_x[-1] - path_x[-2], path_y[-1] - path_y[-2]
                bx, by = nx - path_x[-1], ny - path_y[-1]
                if ax * bx + ay * by < 0:
                    break
            path_x.append(nx)
            path_y.append(ny)

        if len(path_x) < 2:
            continue

        if config.field_dependent_color:
            t = float(scalar_field.sample(np.array([x / ctx.width]), np.array([y / ctx.height]))[0])
            t = (t + 1) * 0.5 if t < 0 else t
            idx = int(np.clip(t, 0, 0.999) * (len(palette_colors) - 1))
            color = np.array(palette_colors[idx], dtype=np.uint8)
            if config.paper_style in {"warm-paper", "plotter"}:
                # Mix toward ink for print look
                color = (0.35 * color.astype(np.float32) + 0.65 * ink_base).astype(np.uint8)
        else:
            color = ink_base.astype(np.uint8)

        width = max(0.6, config.line_width * (0.7 + 0.6 * rng.random()))
        for i in range(len(path_x) - 1):
            draw_line(
                layer,
                (path_x[i], path_y[i]),
                (path_x[i + 1], path_y[i + 1]),
                width,
                color,
            )

    image = canvas.get_image()
    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="flow_hatching",
        config=config,
    )


def presets() -> dict:
    return {
        "laminar": {
            "field_scale": 0.012,
            "line_spacing": 5.5,
            "streamline_steps": 18,
            "density": 0.9,
            "paper_style": "warm-paper",
        },
        "turbulent": {
            "field_scale": 0.035,
            "field_octaves": 5,
            "line_spacing": 3.5,
            "streamline_steps": 28,
            "density": 1.3,
            "paper_style": "dark",
            "palette": "duotone-teal",
        },
        "vortex": {
            "field_scale": 0.02,
            "line_spacing": 4.0,
            "streamline_steps": 40,
            "density": 1.1,
            "paper_style": "dark",
            "palette": "aurora",
        },
        "filament": {
            "field_scale": 0.018,
            "line_spacing": 6.0,
            "line_length": 40,
            "streamline_steps": 32,
            "density": 0.75,
            "paper_style": "plotter",
        },
        "dense-ink": {
            "line_spacing": 2.8,
            "density": 1.6,
            "streamline_steps": 20,
            "paper_style": "warm-paper",
        },
        "sparse": {
            "line_spacing": 9.0,
            "density": 0.45,
            "streamline_steps": 22,
            "mask_margin": 0.12,
            "paper_style": "plotter",
        },
    }
