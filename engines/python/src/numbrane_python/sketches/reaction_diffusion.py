"""Reaction-diffusion (Gray-Scott) sketch."""

import numpy as np
from pydantic import BaseModel, Field
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult
from numbrane_python.render.canvas import Canvas
from numbrane_python.render.palettes import get_palette, gradient_map
from numbrane_python.render.postfx import apply_emboss, apply_vignette

# Gray-Scott evolved presets (composition / style — not core Laplacian math).
EVOLVED_PRESETS: dict[str, tuple[float, float]] = {
    "cells": (0.055, 0.062),
    "worms": (0.054, 0.063),
    "lace": (0.057, 0.061),
    "coral": (0.056, 0.065),
    "membrane": (0.060, 0.062),
    "islands": (0.054, 0.065),
}


class ReactionDiffusionConfig(BaseModel):
    """Configuration for reaction-diffusion sketch."""

    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # Gray-Scott parameters (algorithm)
    f: float = Field(default=0.055, description="Feed rate")
    k: float = Field(default=0.062, description="Kill rate")
    du: float = Field(default=0.16, description="U diffusion rate")
    dv: float = Field(default=0.08, description="V diffusion rate")

    # Simulation (algorithm)
    iterations: int = Field(default=10000, description="Simulation iterations")
    dt: float = Field(default=1.0, description="Time step")

    # Composition — initial field layout (deterministic from seed)
    initial_condition: str = Field(
        default="center",
        description="center|multi-point|ring|stripe|grid|noise-islands|geometry-mask",
    )
    evolved_preset: str = Field(
        default="",
        description="Optional f/k preset: cells|worms|lace|coral|membrane|islands",
    )
    mask: str = Field(
        default="none",
        description="Composition mask for geometry-mask IC and render crop",
    )

    # Rendering / style
    palette: str = Field(default="void")
    emboss_strength: float = Field(default=1.0)
    background: str = Field(default="", description="Intentional background token")
    pfl_style: str = Field(default="", description="PFL art-direction preset id")


def _seed_initial_condition(
    v: np.ndarray,
    u: np.ndarray,
    config: ReactionDiffusionConfig,
    ctx: RenderContext,
) -> None:
    """Deterministic V seeds from initial_condition — does not alter Gray-Scott step."""
    from numbrane_python.composition.grammar import composition_mask

    h, w = ctx.height, ctx.width
    rng = np.random.default_rng(int(config.seed) & 0xFFFFFFFF)
    ic = config.initial_condition
    yy, xx = np.ogrid[:h, :w]
    cx, cy = w * 0.5, h * 0.5

    def _blob(x: int, y: int, radius: int) -> None:
        mask = (xx - x) ** 2 + (yy - y) ** 2 < radius**2
        v[mask] = 1.0

    if ic == "center":
        _blob(int(cx), int(cy), max(8, min(w, h) // 16))
    elif ic == "multi-point":
        n = 6 + int(rng.integers(0, 8))
        for _ in range(n):
            _blob(
                int(rng.integers(w // 8, 7 * w // 8)),
                int(rng.integers(h // 8, 7 * h // 8)),
                int(rng.integers(4, 18)),
            )
    elif ic == "ring":
        r_inner = min(w, h) * (0.22 + (config.seed % 5) * 0.02)
        r_outer = r_inner + min(w, h) * 0.08
        dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        v[(dist > r_inner) & (dist < r_outer)] = 1.0
    elif ic == "stripe":
        period = max(12, min(w, h) // (4 + config.seed % 3))
        phase = int(rng.integers(0, period))
        if config.seed % 2 == 0:
            v[:, (xx[0] + phase) % period < period // 3] = 1.0
        else:
            v[(yy + phase) % period < period // 3, :] = 1.0
    elif ic == "grid":
        step = max(16, min(w, h) // (5 + config.seed % 4))
        v[(yy % step < step // 4) | (xx % step < step // 4)] = 1.0
    elif ic == "noise-islands":
        noise = rng.random((h, w))
        v[noise > 0.72 - (config.seed % 7) * 0.01] = 1.0
    elif ic == "geometry-mask":
        comp_mask = composition_mask(w, h, config.mask or "circle", seed=int(config.seed))
        if comp_mask is not None:
            v[comp_mask > 0.5] = 1.0
        else:
            _blob(int(cx), int(cy), max(8, min(w, h) // 14))
    else:
        _blob(int(cx), int(cy), max(8, min(w, h) // 16))


def render(config: ReactionDiffusionConfig, ctx: RenderContext) -> RenderResult:
    """Render reaction-diffusion."""
    from numbrane_python.composition.grammar import background_rgb, composition_mask
    from numbrane_python.style.pfl import apply_style_to_params

    if config.pfl_style:
        raw = apply_style_to_params(config.pfl_style, config.model_dump())
        config = config.model_copy(
            update={k: raw[k] for k in ("palette", "background", "emboss_strength") if k in raw}
        )

    f, k = config.f, config.k
    if config.evolved_preset and config.evolved_preset in EVOLVED_PRESETS:
        f, k = EVOLVED_PRESETS[config.evolved_preset]

    u = np.ones((ctx.height, ctx.width), dtype=np.float32)
    v = np.zeros((ctx.height, ctx.width), dtype=np.float32)
    _seed_initial_condition(v, u, config, ctx)

    laplacian = np.array(
        [
            [0.05, 0.2, 0.05],
            [0.2, -1.0, 0.2],
            [0.05, 0.2, 0.05],
        ]
    )

    for _ in range(config.iterations):
        u_lap = np.zeros_like(u)
        v_lap = np.zeros_like(v)
        for i in range(-1, 2):
            for j in range(-1, 2):
                u_lap += laplacian[i + 1, j + 1] * np.roll(np.roll(u, i, axis=0), j, axis=1)
                v_lap += laplacian[i + 1, j + 1] * np.roll(np.roll(v, i, axis=0), j, axis=1)
        uv2 = u * v * v
        u_new = u + config.dt * (config.du * u_lap - uv2 + f * (1 - u))
        v_new = v + config.dt * (config.dv * v_lap + uv2 - (f + k) * v)
        u = np.clip(u_new, 0, 1)
        v = np.clip(v_new, 0, 1)

    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    palette_colors = get_palette(config.palette)
    field = v.copy()
    comp_mask = composition_mask(ctx.width, ctx.height, config.mask, seed=int(config.seed))
    if comp_mask is not None:
        field = field * comp_mask

    colors = gradient_map(field, palette_colors)
    if config.background:
        bg = np.array(background_rgb(config.background), dtype=np.uint8)
        layer[:] = bg
        alpha = np.clip(field[..., None], 0.0, 1.0)
        layer[:] = (
            layer.astype(np.float32) * (1.0 - alpha) + colors.astype(np.float32) * alpha
        ).astype(np.uint8)
    else:
        layer[:] = colors

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
