"""Worley/Perlin nebula sketch."""

import numpy as np
from pydantic import BaseModel, Field
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult
from numbrane_python.fields.scalar import NoiseField
from numbrane_python.fields.compose import DomainWarpScalarField
from numbrane_python.fields.vector import CurlNoiseField
from numbrane_python.fields.worley import worley_noise
from numbrane_python.render.canvas import Canvas
from numbrane_python.render.palettes import get_palette, gradient_map
from numbrane_python.render.postfx import apply_bloom, apply_vignette, apply_film_grain


class NebulaConfig(BaseModel):
    """Configuration for nebula sketch."""

    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # Noise parameters
    noise_scale: float = Field(default=0.01)
    noise_octaves: int = Field(default=6)
    warp_strength: float = Field(default=0.3)

    # Worley parameters
    worley_scale: float = Field(default=0.02)

    # Rendering
    palette: str = Field(default="cosmic")
    star_density: float = Field(default=0.001)
    star_brightness: float = Field(default=2.0)
    bloom_intensity: float = Field(default=0.4)


def render(config: NebulaConfig, ctx: RenderContext) -> RenderResult:
    """Render nebula."""
    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    # Create coordinate grids
    y, x = np.ogrid[: ctx.height, : ctx.width]
    x_norm = np.broadcast_to(x / ctx.width, (ctx.height, ctx.width))
    y_norm = np.broadcast_to(y / ctx.height, (ctx.height, ctx.width))

    # Base noise field
    noise_field = NoiseField(
        scale=config.noise_scale,
        octaves=config.noise_octaves,
        seed=ctx.rng.seed,
    )

    # Domain warp
    warp_field = CurlNoiseField(
        scale=config.noise_scale * 0.5,
        strength=config.warp_strength,
        seed=ctx.rng.seed + 1000,
    )

    warped_noise = DomainWarpScalarField(noise_field, warp_field, config.warp_strength)

    # Worley noise
    coords = np.stack([x_norm, y_norm], axis=-1)
    worley = worley_noise(coords * config.worley_scale, seed=ctx.rng.seed + 2000)

    # Combine
    combined = warped_noise.sample(x_norm, y_norm) * 0.7 + worley * 0.3
    combined = (combined - combined.min()) / (combined.max() - combined.min() + 1e-6)

    # Map to colors
    palette_colors = get_palette(config.palette)
    colors = gradient_map(combined, palette_colors)
    layer[:] = colors

    # Add stars
    rng = ctx.rng.generator
    num_stars = int(ctx.width * ctx.height * config.star_density)
    for _ in range(num_stars):
        sx = rng.integers(0, ctx.width)
        sy = rng.integers(0, ctx.height)
        brightness = rng.uniform(0.5, 1.0) * config.star_brightness
        star_color = np.array([255, 255, 255]) * brightness
        layer[sy, sx] = np.clip(star_color, 0, 255)

    image = canvas.get_image()

    # Post-processing
    if config.bloom_intensity > 0:
        image = apply_bloom(image, intensity=config.bloom_intensity, threshold=0.6)
    image = apply_vignette(image, 0.3)
    image = apply_film_grain(image, 0.02, ctx.rng.seed)

    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="nebula",
        config=config,
    )
