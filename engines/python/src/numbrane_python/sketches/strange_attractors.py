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
        default="lorenz", description="Attractor type (lorenz, rossler, clifford)"
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
    palette: str = Field(default="void", description="Color palette")
    density_scale: float = Field(default=1.0, description="Density scaling")
    trail_length: int = Field(default=100, description="Trail length for rendering")


def render(config: StrangeAttractorsConfig, ctx: RenderContext) -> RenderResult:
    """Render strange attractor."""
    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    # Initialize state
    rng = ctx.rng.generator
    if config.attractor_type == "lorenz":
        x, y, z = 1.0, 1.0, 1.0
    elif config.attractor_type == "rossler":
        x, y, z = 0.0, 0.0, 0.0
    else:  # clifford
        x, y = 0.0, 0.0

    # Density map
    density = np.zeros((ctx.height, ctx.width), dtype=np.float32)
    samples: list[tuple[float, float]] = []

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
            dy = x + config.rossler_a * y
            dz = config.rossler_b + z * (x - config.rossler_c)
            x += dx * config.dt
            y += dy * config.dt
            z += dz * config.dt
        else:  # clifford (2D)
            x_new = np.sin(config.clifford_a * y) + config.clifford_c * np.cos(
                config.clifford_a * x
            )
            y_new = np.sin(config.clifford_b * x) + config.clifford_d * np.cos(
                config.clifford_b * y
            )
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

        samples.append((px, py))

    if not samples:
        samples = [(0.0, 0.0)]
    xs = np.array([p[0] for p in samples], dtype=np.float64)
    ys = np.array([p[1] for p in samples], dtype=np.float64)
    min_x, max_x = float(xs.min()), float(xs.max())
    min_y, max_y = float(ys.min()), float(ys.max())
    span_x = max(max_x - min_x, 1e-6)
    span_y = max(max_y - min_y, 1e-6)
    # square framing with margin
    span = max(span_x, span_y) * 1.15
    cx, cy = (min_x + max_x) * 0.5, (min_y + max_y) * 0.5
    for px, py in samples:
        screen_x = int(((px - cx) / span + 0.5) * ctx.width)
        screen_y = int(((py - cy) / span + 0.5) * ctx.height)
        if 0 <= screen_x < ctx.width and 0 <= screen_y < ctx.height:
            density[screen_y, screen_x] += 1.0

    # Normalize density
    density = (density - density.min()) / (density.max() - density.min() + 1e-6)
    density = np.power(density, 1.0 / config.density_scale)

    # Map to colors
    palette_colors = get_palette(config.palette)
    colors = gradient_map(density, palette_colors)
    layer[:] = colors

    image = canvas.get_image()

    # Post-processing
    image = apply_vignette(image, 0.3)
    image = apply_bloom(image, intensity=0.3, threshold=0.5)

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
        "lorenz_classic": {
            "attractor_type": "lorenz",
            "lorenz_sigma": 10.0,
            "lorenz_rho": 28.0,
            "lorenz_beta": 8.0 / 3.0,
        },
        "rossler_chaos": {
            "attractor_type": "rossler",
            "rossler_a": 0.2,
            "rossler_b": 0.2,
            "rossler_c": 5.7,
        },
        "clifford_art": {
            "attractor_type": "clifford",
            "clifford_a": -1.4,
            "clifford_b": 1.6,
            "clifford_c": 1.0,
            "clifford_d": 0.7,
        },
    }
