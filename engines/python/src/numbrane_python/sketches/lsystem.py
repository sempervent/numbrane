"""L-system / space colonization sketch."""

import numpy as np
from pydantic import BaseModel, Field
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult
from numbrane_python.render.canvas import Canvas
from numbrane_python.render.draw import draw_line
from numbrane_python.render.palettes import get_palette


class LSystemConfig(BaseModel):
    """Configuration for L-system sketch."""

    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # L-system parameters
    axiom: str = Field(default="F", description="Starting axiom")
    rules: dict = Field(default={"F": "F[+F]F[-F]F"}, description="Production rules")
    iterations: int = Field(default=5, description="Number of iterations")
    angle: float = Field(default=25.0, description="Rotation angle (degrees)")
    step_size: float = Field(default=10.0, description="Step size")

    # Rendering
    line_width: float = Field(default=2.0)
    palette: str = Field(default="forest")
    jitter: float = Field(default=0.1, description="Position jitter")


def render(config: LSystemConfig, ctx: RenderContext) -> RenderResult:
    """Render L-system."""
    # Generate string
    current = config.axiom
    for _ in range(config.iterations):
        next_str = ""
        for char in current:
            next_str += config.rules.get(char, char)
        current = next_str

    # Interpret string
    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    stack = []
    x, y = ctx.width / 2, ctx.height * 0.92
    angle = -90.0  # Point upward

    palette_colors = get_palette(config.palette)
    color = np.array(palette_colors[0], dtype=np.uint8)

    rng = ctx.rng.generator
    complexity = max(1, len(current))
    step_size = min(config.step_size, min(ctx.width, ctx.height) * 0.75 / complexity)

    for char in current:
        if char == "F":
            # Move forward
            new_x = x + np.cos(np.deg2rad(angle)) * step_size
            new_y = y + np.sin(np.deg2rad(angle)) * step_size

            # Add jitter
            if config.jitter > 0:
                new_x += rng.normal(0, config.jitter * step_size)
                new_y += rng.normal(0, config.jitter * step_size)

            draw_line(layer, (x, y), (new_x, new_y), max(1.0, config.line_width), color)
            x, y = new_x, new_y
        elif char == "+":
            angle += config.angle
        elif char == "-":
            angle -= config.angle
        elif char == "[":
            stack.append((x, y, angle))
        elif char == "]":
            x, y, angle = stack.pop()

    image = canvas.get_image()

    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="lsystem",
        config=config,
    )
