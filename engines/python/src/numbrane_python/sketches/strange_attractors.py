"""Strange attractors sketch."""

import numpy as np
from pydantic import BaseModel, Field
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult
from numbrane_python.render.canvas import Canvas
from numbrane_python.render.palettes import get_palette, gradient_map
from numbrane_python.render.postfx import apply_vignette, apply_bloom


class StrangeAttractorsConfig(BaseModel):
    """Configuration for strange attractors sketch."""

    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # Attractor type
    attractor_type: str = Field(
        default="clifford", description="Attractor type (lorenz, rossler, clifford)"
    )

    # Lorenz parameters
    lorenz_sigma: float = Field(default=10.0, description="Lorenz sigma")
    lorenz_rho: float = Field(default=28.0, description="Lorenz rho")
    lorenz_beta: float = Field(default=8.0 / 3.0, description="Lorenz beta")

    # Rossler parameters
    rossler_a: float = Field(default=0.2, description="Rossler a")
    rossler_b: float = Field(default=0.2, description="Rossler b")
    rossler_c: float = Field(default=5.7, description="Rossler c")

    # Clifford parameters
    clifford_a: float = Field(default=-1.4, description="Clifford a")
    clifford_b: float = Field(default=1.6, description="Clifford b")
    clifford_c: float = Field(default=1.0, description="Clifford c")
    clifford_d: float = Field(default=0.7, description="Clifford d")

    # Simulation
    steps: int = Field(default=100000, description="Number of integration steps")
    dt: float = Field(default=0.01, description="Time step")
    burn_in: int = Field(default=1000, description="Burn-in steps")

    # Projection
    projection: str = Field(default="xy", description="Projection (xy, xz, yz)")

    # Rendering
    palette: str = Field(default="ink", description="Color palette")
    density_scale: float = Field(default=0.55, description="Density gamma (<1 boosts ink)")
    trail_length: int = Field(default=100, description="Trail length for rendering")
    framing: str = Field(default="fit", description="Framing mode: fit | center | fixed")
    margin: float = Field(default=1.18, description="Framing margin multiplier")
    view_span: float = Field(default=40.0, description="Fixed framing span (world units)")
    ink: float = Field(default=1.35, description="Ink accumulation multiplier")
    paper_style: str = Field(
        default="dark", description="Paper style: dark | warm-paper | white-ink | plotter"
    )
    # Composition / style
    render_mode: str = Field(
        default="fine-ink",
        description="fine-ink | dense-ink | long-exposure | calligraphic | ghost | technical",
    )
    background: str = Field(default="near-black")
    center_bias: float = Field(default=0.55, ge=0.0, le=1.0)
    off_center_x: float = Field(default=0.0, ge=-0.4, le=0.4)
    off_center_y: float = Field(default=0.0, ge=-0.4, le=0.4)
    stroke_opacity: float = Field(default=1.0, ge=0.2, le=1.5)
    pfl_style: str = Field(default="")


def render(config: StrangeAttractorsConfig, ctx: RenderContext) -> RenderResult:
    """Render strange attractor with composition-aware framing."""
    from numbrane_python.composition.grammar import background_rgb
    from numbrane_python.style.pfl import apply_style_to_params

    # Optional PFL style merge into a working config view
    if config.pfl_style:
        from numbrane_python.style.pfl import apply_style_to_params

        raw = apply_style_to_params(config.pfl_style, config.model_dump())
        updates = {
            k: raw[k] for k in ("palette", "paper_style", "background", "ink", "margin") if k in raw
        }
        config = config.model_copy(update=updates)

    mode = config.render_mode
    ink = float(config.ink) * float(config.stroke_opacity)
    density_scale = float(config.density_scale)
    soft_amt = 0.12
    if mode == "dense-ink":
        ink *= 1.35
        density_scale = min(density_scale, 0.42)
        soft_amt = 0.18
    elif mode == "fine-ink":
        ink *= 0.85
        density_scale = max(density_scale, 0.5)
        soft_amt = 0.08
    elif mode == "long-exposure":
        ink *= 1.55
        density_scale = min(density_scale, 0.38)
        soft_amt = 0.22
    elif mode == "calligraphic":
        ink *= 1.1
        density_scale = 0.48
        soft_amt = 0.05
    elif mode == "ghost":
        ink *= 0.55
        density_scale = 0.65
        soft_amt = 0.2
    elif mode == "technical":
        ink *= 1.0
        density_scale = 0.55
        soft_amt = 0.04

    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")
    bg = background_rgb(config.background)
    layer[:] = bg
    rng = np.random.default_rng(int(config.seed) & 0xFFFFFFFF)

    # Seed-driven initial conditions and bounded coefficient variation
    if config.attractor_type == "lorenz":
        x, y, z = (float(v) for v in rng.uniform(-1.5, 1.5, 3))
        sigma = config.lorenz_sigma + float(rng.uniform(-0.8, 0.8))
        rho = config.lorenz_rho + float(rng.uniform(-2.5, 2.5))
        beta = config.lorenz_beta + float(rng.uniform(-0.2, 0.2))
    elif config.attractor_type == "rossler":
        x, y, z = (float(v) for v in rng.uniform(-0.5, 0.5, 3))
        ra = config.rossler_a + float(rng.uniform(-0.05, 0.05))
        rb = config.rossler_b + float(rng.uniform(-0.05, 0.05))
        rc = config.rossler_c + float(rng.uniform(-0.4, 0.4))
    else:  # clifford
        x, y = (float(v) for v in rng.uniform(-0.1, 0.1, 2))
        ca = config.clifford_a + float(rng.uniform(-0.45, 0.45))
        cb = config.clifford_b + float(rng.uniform(-0.45, 0.45))
        cc = config.clifford_c + float(rng.uniform(-0.35, 0.35))
        cd = config.clifford_d + float(rng.uniform(-0.35, 0.35))

    density = np.zeros((ctx.height, ctx.width), dtype=np.float32)
    samples: list[tuple[float, float]] = []

    for i in range(config.steps + config.burn_in):
        if config.attractor_type == "lorenz":
            dx = sigma * (y - x)
            dy = x * (rho - z) - y
            dz = x * y - beta * z
            x += dx * config.dt
            y += dy * config.dt
            z += dz * config.dt
        elif config.attractor_type == "rossler":
            dx = -(y + z)
            dy = x + ra * y
            dz = rb + z * (x - rc)
            x += dx * config.dt
            y += dy * config.dt
            z += dz * config.dt
        else:
            x_new = np.sin(ca * y) + cc * np.cos(ca * x)
            y_new = np.sin(cb * x) + cd * np.cos(cb * y)
            x, y = float(x_new), float(y_new)

        if i < config.burn_in:
            continue

        if config.attractor_type == "clifford":
            px, py = x, y
        elif config.projection == "xy":
            px, py = x, y
        elif config.projection == "xz":
            px, py = x, z
        else:
            px, py = y, z
        samples.append((px, py))

    if not samples:
        samples = [(0.0, 0.0)]
    xs = np.array([p[0] for p in samples], dtype=np.float64)
    ys = np.array([p[1] for p in samples], dtype=np.float64)
    min_x, max_x = float(xs.min()), float(xs.max())
    min_y, max_y = float(ys.min()), float(ys.max())
    span_x = max(max_x - min_x, 1e-6)
    span_y = max(max_y - min_y, 1e-6)
    cx = (min_x + max_x) * 0.5 + float(config.off_center_x) * span_x
    cy = (min_y + max_y) * 0.5 + float(config.off_center_y) * span_y
    margin = max(1.05, float(config.margin))
    # More center_bias → tighter crop (less empty), less → more negative space
    margin = margin * (0.9 + 0.35 * (1.0 - float(config.center_bias)))
    aspect = ctx.width / max(ctx.height, 1)

    if config.framing == "fixed":
        span = max(float(config.view_span), 1e-6)
        span_x_use = span * aspect
        span_y_use = span
    elif config.framing == "center":
        span_x_use = span_x * margin
        span_y_use = span_y * margin
    else:
        span = max(span_x, span_y) * margin
        span_x_use = span * aspect if aspect >= 1 else span
        span_y_use = span if aspect >= 1 else span / max(aspect, 1e-6)

    for px, py in samples:
        screen_x = int(((px - cx) / span_x_use + 0.5) * ctx.width)
        screen_y = int(((py - cy) / span_y_use + 0.5) * ctx.height)
        if 0 <= screen_x < ctx.width and 0 <= screen_y < ctx.height:
            density[screen_y, screen_x] += ink

    if density.max() > 0:
        padded = np.pad(density, 1, mode="constant")
        soft = density.copy()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                soft += padded[1 + dy : 1 + dy + ctx.height, 1 + dx : 1 + dx + ctx.width] * soft_amt
        density = soft

    # Log tone-map so sparse trajectories read as ink, not single-pixel spikes
    density = np.log1p(density * 8.0)
    p99 = float(np.percentile(density, 99.5)) if density.max() > 0 else 1.0
    density = np.clip(density / max(p99, 1e-6), 0.0, 1.0)
    density = np.power(density, max(0.22, density_scale * 0.85))

    style = config.paper_style
    if style == "warm-paper" or config.background == "warm-paper":
        paper = np.full((ctx.height, ctx.width, 3), background_rgb("warm-paper"), dtype=np.float32)
        ink_rgb = np.array([28, 24, 22], dtype=np.float32)
        colors = paper * (1.0 - density[..., None]) + ink_rgb * density[..., None]
        layer[:] = np.clip(colors, 0, 255).astype(np.uint8)
    elif style == "white-ink":
        paper = np.zeros((ctx.height, ctx.width, 3), dtype=np.float32)
        colors = paper + density[..., None] * 245.0
        layer[:] = np.clip(colors, 0, 255).astype(np.uint8)
    elif style == "plotter" or mode == "technical":
        paper = np.full((ctx.height, ctx.width, 3), 255, dtype=np.float32)
        colors = paper * (1.0 - np.clip(density * 1.2, 0, 1)[..., None])
        layer[:] = np.clip(colors, 0, 255).astype(np.uint8)
    else:
        palette_name = config.palette if config.palette not in {"void", ""} else "monochrome-ink"
        palette_colors = get_palette(palette_name)
        # Composite ink over intentional background
        paper = np.full((ctx.height, ctx.width, 3), bg, dtype=np.float32)
        mapped = gradient_map(density, palette_colors).astype(np.float32)
        colors = paper * (1.0 - density[..., None]) + mapped * density[..., None]
        layer[:] = np.clip(colors, 0, 255).astype(np.uint8)

    image = canvas.get_image()
    if style == "dark" and mode != "technical":
        vig = 0.18 if mode != "ghost" else 0.12
        image = apply_vignette(image, vig)
        bloom = 0.14 if mode != "calligraphic" else 0.06
        if mode == "long-exposure":
            bloom = 0.22
        image = apply_bloom(image, intensity=bloom, threshold=0.55)
    elif style == "white-ink":
        image = apply_vignette(image, 0.15)

    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="strange_attractors",
        config=config,
    )


def get_schema():
    """Get parameter schema."""
    from numbrane_python.params.schema import ParamSchema
    from numbrane_python.params.types import (
        IntParam,
        FloatParam,
        ChoiceParam,
        ColorParam,
    )

    return ParamSchema(
        name="strange_attractors",
        description="Strange attractors (Lorenz, Rossler, Clifford)",
        params=[
            ChoiceParam(
                "attractor_type",
                ["lorenz", "rossler", "clifford"],
                default="lorenz",
                path="sim.type",
            ),
            FloatParam("lorenz_sigma", 1.0, 20.0, 10.0, path="sim.lorenz.sigma"),
            FloatParam("lorenz_rho", 10.0, 50.0, 28.0, path="sim.lorenz.rho"),
            FloatParam("lorenz_beta", 1.0, 5.0, 8.0 / 3.0, path="sim.lorenz.beta"),
            FloatParam("rossler_a", 0.1, 0.5, 0.2, path="sim.rossler.a"),
            FloatParam("rossler_b", 0.1, 0.5, 0.2, path="sim.rossler.b"),
            FloatParam("rossler_c", 1.0, 20.0, 5.7, path="sim.rossler.c"),
            IntParam("steps", 10000, 500000, 100000, path="sim.steps"),
            FloatParam("dt", 0.001, 0.1, 0.01, path="sim.dt"),
            ChoiceParam("projection", ["xy", "xz", "yz"], default="xy", path="output.projection"),
            ColorParam("palette", "void", path="color.palette"),
        ],
    )


def defaults() -> dict:
    """Get default values."""
    config = StrangeAttractorsConfig()
    return config.model_dump()


def presets() -> dict:
    """Return curated presets."""
    return {
        "fine-line": {
            "attractor_type": "clifford",
            "steps": 250000,
            "ink": 1.6,
            "density_scale": 0.45,
            "framing": "fit",
            "paper_style": "plotter",
            "palette": "ink",
        },
        "dense-cloud": {
            "attractor_type": "lorenz",
            "steps": 200000,
            "ink": 1.8,
            "density_scale": 0.4,
            "framing": "fit",
            "paper_style": "dark",
            "palette": "duotone-teal",
        },
        "calligraphic": {
            "attractor_type": "rossler",
            "steps": 180000,
            "ink": 1.5,
            "density_scale": 0.5,
            "framing": "center",
            "paper_style": "warm-paper",
            "palette": "earth",
        },
        "symmetry": {
            "attractor_type": "clifford",
            "clifford_a": -1.4,
            "clifford_b": 1.6,
            "clifford_c": 1.0,
            "clifford_d": 0.7,
            "steps": 300000,
            "ink": 1.4,
            "framing": "fit",
            "paper_style": "white-ink",
        },
        "long-exposure": {
            "attractor_type": "lorenz",
            "steps": 400000,
            "ink": 1.1,
            "density_scale": 0.35,
            "framing": "fit",
            "paper_style": "dark",
            "palette": "aurora",
        },
        "lorenz_classic": {
            "attractor_type": "lorenz",
            "lorenz_sigma": 10.0,
            "lorenz_rho": 28.0,
            "lorenz_beta": 8.0 / 3.0,
            "ink": 1.4,
            "framing": "fit",
        },
        "rossler_chaos": {
            "attractor_type": "rossler",
            "rossler_a": 0.2,
            "rossler_b": 0.2,
            "rossler_c": 5.7,
            "ink": 1.4,
        },
        "clifford_art": {
            "attractor_type": "clifford",
            "clifford_a": -1.4,
            "clifford_b": 1.6,
            "clifford_c": 1.0,
            "clifford_d": 0.7,
            "ink": 1.5,
            "paper_style": "plotter",
        },
    }
