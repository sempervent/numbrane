"""Reaction-diffusion (Gray-Scott) sketch."""

from __future__ import annotations

import numpy as np
from pydantic import BaseModel, Field
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult
from numbrane_python.render.canvas import Canvas
from numbrane_python.render.palettes import get_palette, gradient_map
from numbrane_python.render.postfx import apply_emboss, apply_vignette

# Evolved presets: IC + Gray-Scott params + settle + render/composition tendencies.
# Settled looks (lace/coral/worms/…) — not raw IC rings.
# Params validated against classic Pearson regimes with u=0.5 / v=0.25 seeding.
EVOLVED_PRESETS: dict[str, dict] = {
    "coral": {
        "f": 0.03,
        "k": 0.0565,
        "du": 0.16,
        "dv": 0.08,
        "initial_condition": "multi-point",
        "settle_steps": 3200,
        "mask": "none",
        "emboss_strength": 1.15,
        "palette": "ember",
        "background": "near-black",
    },
    "membrane": {
        "f": 0.034,
        "k": 0.061,
        "du": 0.16,
        "dv": 0.08,
        "initial_condition": "multi-point",
        "settle_steps": 3500,
        "mask": "central-void",
        "emboss_strength": 0.9,
        "palette": "void",
        "background": "single-dark-hue",
    },
    "worms": {
        "f": 0.037,
        "k": 0.06,
        "du": 0.16,
        "dv": 0.08,
        "initial_condition": "stripe",
        "settle_steps": 3000,
        "mask": "none",
        "emboss_strength": 1.15,
        "palette": "void",
        "background": "near-black",
    },
    "lace": {
        "f": 0.03,
        "k": 0.0565,
        "du": 0.16,
        "dv": 0.08,
        "initial_condition": "multi-point",
        "settle_steps": 4000,
        "mask": "none",
        "emboss_strength": 1.2,
        "palette": "void",
        "background": "pure-black",
    },
    "cells": {
        "f": 0.037,
        "k": 0.06,
        "du": 0.16,
        "dv": 0.08,
        "initial_condition": "multi-point",
        "settle_steps": 3200,
        "mask": "none",
        "emboss_strength": 1.0,
        "palette": "void",
        "background": "near-black",
    },
    "islands": {
        "f": 0.034,
        "k": 0.061,
        "du": 0.16,
        "dv": 0.08,
        "initial_condition": "multi-point",
        "settle_steps": 3500,
        "mask": "none",
        "emboss_strength": 1.05,
        "palette": "void",
        "background": "near-black",
    },
}

# Soft underdevelopment thresholds (deterministic; resolution-aware scaling applied at runtime).
_MIN_VARIANCE = 0.008
_MIN_EDGE = 0.012
_MIN_OCCUPIED = 0.04
_DEFAULT_SETTLE_CAP_MULT = 1.75
_DEFAULT_SETTLE_CAP_ABS = 9000


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
    iterations: int = Field(
        default=10000,
        description="Fallback simulation iterations when settle_steps is 0",
    )
    dt: float = Field(default=1.0, description="Time step")
    settle_steps: int = Field(
        default=0,
        description="Auto-settle steps before render; 0 = use iterations / preset",
    )
    auto_extend_settle: bool = Field(
        default=True,
        description="Extend settle slightly if field looks underdeveloped",
    )
    settle_cap: int = Field(
        default=0,
        description="Hard cap on total settle steps; 0 = derived from settle_steps",
    )

    # Composition — initial field layout (deterministic from seed)
    initial_condition: str = Field(
        default="center",
        description="center|multi-point|ring|stripe|grid|noise-islands|geometry-mask",
    )
    evolved_preset: str = Field(
        default="",
        description="Optional evolved look: cells|worms|lace|coral|membrane|islands",
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


def apply_evolved_preset(config: ReactionDiffusionConfig) -> ReactionDiffusionConfig:
    """Merge evolved_preset IC / f-k / settle / composition tendencies into config."""
    name = (config.evolved_preset or "").strip()
    if not name or name not in EVOLVED_PRESETS:
        return config
    preset = EVOLVED_PRESETS[name]
    updates = {k: v for k, v in preset.items()}
    # Explicit settle_steps on config wins over preset when already set > 0.
    if config.settle_steps > 0:
        updates.pop("settle_steps", None)
    return config.model_copy(update=updates)


def _seed_initial_condition(
    v: np.ndarray,
    u: np.ndarray,
    config: ReactionDiffusionConfig,
    height: int,
    width: int,
) -> None:
    """Deterministic V seeds from initial_condition — does not alter Gray-Scott step."""
    from numbrane_python.composition.grammar import composition_mask

    h, w = height, width
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
        # Thin sparse bands — solid bars freeze into wallpaper under Gray-Scott.
        period = max(14, min(w, h) // (4 + config.seed % 3))
        phase = int(rng.integers(0, period))
        thickness = max(2, period // 10)
        noise = rng.random((h, w))
        if config.seed % 2 == 0:
            band = ((xx + phase) % period) < thickness
        else:
            band = ((yy + phase) % period) < thickness
        v[band & (noise > 0.45)] = 1.0
    elif ic == "grid":
        step = max(16, min(w, h) // (5 + config.seed % 4))
        # Sparse nodes on a lattice rather than solid grid lines.
        nodes = (yy % step < max(2, step // 10)) & (xx % step < max(2, step // 10))
        v[nodes] = 1.0
    elif ic == "noise-islands":
        noise = rng.random((h, w))
        # Sparse islands — dense V seeds kill maze/lace regimes.
        v[noise > 0.88 - (config.seed % 5) * 0.008] = 1.0
    elif ic == "geometry-mask":
        comp_mask = composition_mask(w, h, config.mask or "circle", seed=int(config.seed))
        if comp_mask is not None:
            v[comp_mask > 0.5] = 1.0
        else:
            _blob(int(cx), int(cy), max(8, min(w, h) // 14))
    else:
        _blob(int(cx), int(cy), max(8, min(w, h) // 16))

    # Classic Gray-Scott seed amplitudes (v=1 / u=1 extinguishes many Pearson regimes).
    seeded = v > 0.05
    u[seeded] = 0.50
    v[seeded] = 0.25


def gray_scott_steps(
    u: np.ndarray,
    v: np.ndarray,
    *,
    f: float,
    k: float,
    du: float,
    dv: float,
    dt: float,
    steps: int,
) -> tuple[np.ndarray, np.ndarray]:
    """Run Gray-Scott for ``steps`` iterations (9-point Laplacian, wrap boundaries)."""
    from scipy import ndimage

    laplacian = np.array(
        [
            [0.05, 0.2, 0.05],
            [0.2, -1.0, 0.2],
            [0.05, 0.2, 0.05],
        ],
        dtype=np.float32,
    )
    u = u.astype(np.float32, copy=False)
    v = v.astype(np.float32, copy=False)
    for _ in range(max(0, int(steps))):
        u_lap = ndimage.convolve(u, laplacian, mode="wrap")
        v_lap = ndimage.convolve(v, laplacian, mode="wrap")
        uv2 = u * v * v
        u = np.clip(u + dt * (du * u_lap - uv2 + f * (1 - u)), 0, 1)
        v = np.clip(v + dt * (dv * v_lap + uv2 - (f + k) * v), 0, 1)
    return u, v


def field_development_metrics(v: np.ndarray) -> dict[str, float]:
    """Variance / edge density / occupied fraction for settle heuristics and tests."""
    v32 = v.astype(np.float32)
    var = float(np.var(v32))
    gy, gx = np.gradient(v32)
    edge = float(np.mean(np.sqrt(gx * gx + gy * gy)))
    occupied = float(np.mean(v32 > 0.1))
    return {"variance": var, "edge_density": edge, "occupied": occupied}


def _underdeveloped(metrics: dict[str, float], *, scale: float = 1.0) -> bool:
    """Deterministic underdevelopment check; ``scale`` softens thresholds at tiny canvases."""
    s = max(0.5, min(2.0, scale))
    return (
        metrics["variance"] < _MIN_VARIANCE * s
        or metrics["edge_density"] < _MIN_EDGE * s
        or metrics["occupied"] < _MIN_OCCUPIED * s
    )


def resolve_settle_budget(config: ReactionDiffusionConfig) -> tuple[int, int]:
    """Return (base_settle_steps, hard_cap).

    ``settle_steps`` (from evolved_preset or explicit) drives auto-settle.
    When unset (0), falls back to ``iterations``.
    """
    base = int(config.settle_steps) if config.settle_steps > 0 else int(config.iterations)
    base = max(0, base)
    if config.settle_cap > 0:
        cap = int(config.settle_cap)
    else:
        cap = min(
            _DEFAULT_SETTLE_CAP_ABS,
            max(base, int(base * _DEFAULT_SETTLE_CAP_MULT)),
        )
    return base, max(base, cap)


def settle_fields(
    u: np.ndarray,
    v: np.ndarray,
    config: ReactionDiffusionConfig,
) -> tuple[np.ndarray, np.ndarray, int]:
    """Auto-settle Gray-Scott; optionally extend if underdeveloped (capped)."""
    base, cap = resolve_settle_budget(config)
    u, v = gray_scott_steps(
        u,
        v,
        f=config.f,
        k=config.k,
        du=config.du,
        dv=config.dv,
        dt=config.dt,
        steps=base,
    )
    total = base
    if config.auto_extend_settle and total < cap:
        # Chunked extensions keep the check cheap and deterministic.
        chunk = max(50, min(400, (cap - total) // 3 or 50))
        scale = (64.0 / max(min(u.shape), 1)) ** 0.5
        while total < cap and _underdeveloped(field_development_metrics(v), scale=scale):
            step = min(chunk, cap - total)
            u, v = gray_scott_steps(
                u,
                v,
                f=config.f,
                k=config.k,
                du=config.du,
                dv=config.dv,
                dt=config.dt,
                steps=step,
            )
            total += step
    return u, v, total


def simulate_settled(
    config: ReactionDiffusionConfig,
    *,
    width: int | None = None,
    height: int | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Seed IC and settle; returns (u, v_settled, v_ic) for tests / GENERATE path."""
    config = apply_evolved_preset(config)
    w = int(width or config.width)
    h = int(height or config.height)
    u = np.ones((h, w), dtype=np.float32)
    v = np.zeros((h, w), dtype=np.float32)
    _seed_initial_condition(v, u, config, h, w)
    v_ic = v.copy()
    u, v, _ = settle_fields(u, v, config)
    return u, v, v_ic


def render(config: ReactionDiffusionConfig, ctx: RenderContext) -> RenderResult:
    """Render reaction-diffusion (auto-settled when settle_steps / preset set)."""
    from numbrane_python.composition.grammar import background_rgb, composition_mask
    from numbrane_python.style.pfl import apply_style_to_params

    config = apply_evolved_preset(config)

    if config.pfl_style:
        raw = apply_style_to_params(config.pfl_style, config.model_dump())
        config = config.model_copy(
            update={k: raw[k] for k in ("palette", "background", "emboss_strength") if k in raw}
        )

    u = np.ones((ctx.height, ctx.width), dtype=np.float32)
    v = np.zeros((ctx.height, ctx.width), dtype=np.float32)
    _seed_initial_condition(v, u, config, ctx.height, ctx.width)
    u, v, _ = settle_fields(u, v, config)

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
