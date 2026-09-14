"""Reaction-diffusion (Gray-Scott) sketch."""

import numpy as np
from pydantic import BaseModel, Field
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult
from numbrane_python.render.canvas import Canvas
from numbrane_python.render.palettes import get_palette, gradient_map
from numbrane_python.render.postfx import apply_emboss, apply_vignette


class ReactionDiffusionConfig(BaseModel):
    """Configuration for reaction-diffusion sketch."""

    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # Gray-Scott parameters
    f: float = Field(default=0.055, description="Feed rate")
    k: float = Field(default=0.062, description="Kill rate")
    du: float = Field(default=0.16, description="U diffusion rate")
    dv: float = Field(default=0.08, description="V diffusion rate")

    # Simulation
    iterations: int = Field(default=10000, description="Simulation iterations")
    dt: float = Field(default=1.0, description="Time step")

    # Rendering
    palette: str = Field(default="void")
    emboss_strength: float = Field(default=1.0)


def render(config: ReactionDiffusionConfig, ctx: RenderContext) -> RenderResult:
    """Render reaction-diffusion."""
    # Initialize U and V
    u = np.ones((ctx.height, ctx.width), dtype=np.float32)
    v = np.zeros((ctx.height, ctx.width), dtype=np.float32)

    # Add seed points
    rng = ctx.rng.generator
    num_seeds = 10
    for _ in range(num_seeds):
        x = rng.integers(0, ctx.width)
        y = rng.integers(0, ctx.height)
        radius = rng.integers(5, 20)
        yy, xx = np.ogrid[: ctx.height, : ctx.width]
        mask = (xx - x) ** 2 + (yy - y) ** 2 < radius**2
        v[mask] = 1.0

    # Laplacian kernel
    laplacian = np.array(
        [
            [0.05, 0.2, 0.05],
            [0.2, -1.0, 0.2],
            [0.05, 0.2, 0.05],
        ]
    )

    # Simulation
    for _ in range(config.iterations):
        # Compute Laplacians
        u_lap = np.zeros_like(u)
        v_lap = np.zeros_like(v)

        for i in range(-1, 2):
            for j in range(-1, 2):
                u_lap += laplacian[i + 1, j + 1] * np.roll(np.roll(u, i, axis=0), j, axis=1)
                v_lap += laplacian[i + 1, j + 1] * np.roll(np.roll(v, i, axis=0), j, axis=1)

        # Gray-Scott equations
        uv2 = u * v * v
        u_new = u + config.dt * (config.du * u_lap - uv2 + config.f * (1 - u))
        v_new = v + config.dt * (config.dv * v_lap + uv2 - (config.f + config.k) * v)

        u = np.clip(u_new, 0, 1)
        v = np.clip(v_new, 0, 1)

    # Render
    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    # Map V to colors
    palette_colors = get_palette(config.palette)
    colors = gradient_map(v, palette_colors)
    layer[:] = colors

    # Apply emboss
    if config.emboss_strength > 0:
        layer[:] = apply_emboss(layer, config.emboss_strength)

    image = canvas.get_image()
    image = apply_vignette(image, 0.2)

    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="reaction_diffusion",
        config=config,
    )
