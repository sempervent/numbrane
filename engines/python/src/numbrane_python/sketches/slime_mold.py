"""Slime mold / Physarum-inspired sketch."""

import numpy as np
from pydantic import BaseModel, Field
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult
from numbrane_python.render.canvas import Canvas
from numbrane_python.render.palettes import get_palette, gradient_map
from numbrane_python.render.postfx import apply_vignette, apply_bloom


def _nutrient_field(
    width: int,
    height: int,
    layout: str,
    seed: int,
) -> np.ndarray:
    """Deterministic nutrient bias field — composition only, not agent kinematics."""
    rng = np.random.default_rng(seed & 0xFFFFFFFF)
    field = np.zeros((height, width), dtype=np.float32)
    yy, xx = np.mgrid[0:height, 0:width]
    cx, cy = (width - 1) * 0.5, (height - 1) * 0.5
    nx = (xx - cx) / max(cx, 1)
    ny = (yy - cy) / max(cy, 1)
    r = np.sqrt(nx * nx + ny * ny)

    if layout == "central":
        field = np.exp(-r * r * 2.5).astype(np.float32)
    elif layout == "ring":
        field = np.exp(-((r - 0.45) ** 2) * 18.0).astype(np.float32)
    elif layout == "constellation":
        n = 8 + seed % 6
        for _ in range(n):
            px = rng.uniform(0.15, 0.85) * width
            py = rng.uniform(0.15, 0.85) * height
            rad = rng.uniform(8, 28)
            field += np.exp(-((xx - px) ** 2 + (yy - py) ** 2) / (2 * rad * rad))
    elif layout == "voronoi":
        pts = rng.uniform(0, 1, (12 + seed % 5, 2))
        flat = np.stack([xx.ravel() / max(width, 1), yy.ravel() / max(height, 1)], axis=1)
        dists = ((flat[:, None, :] - pts[None, :, :]) ** 2).sum(axis=2)
        nearest = np.argmin(dists, axis=1)
        field = (nearest % 3 == seed % 3).astype(np.float32).reshape(height, width)
    elif layout == "bands":
        period = max(24, min(width, height) // (4 + seed % 3))
        field = (np.sin(yy / period * np.pi * 2 + seed * 0.01) > 0).astype(np.float32)
    elif layout == "islands":
        noise = rng.random((height, width))
        field = (noise > 0.55 - (seed % 5) * 0.02).astype(np.float32)
    else:
        field = np.ones((height, width), dtype=np.float32) * 0.25

    mx = float(field.max())
    if mx > 1e-6:
        field /= mx
    return field


class SlimeMoldConfig(BaseModel):
    """Configuration for slime mold sketch."""

    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # Agent parameters (algorithm)
    num_agents: int = Field(default=5000, description="Number of agents")
    sensor_angle: float = Field(default=45.0, description="Sensor angle (degrees)")
    sensor_distance: float = Field(default=9.0, description="Sensor distance")
    rotation_angle: float = Field(default=45.0, description="Rotation angle (degrees)")
    step_size: float = Field(default=1.0, description="Step size")

    # Trail parameters (algorithm)
    deposit_amount: float = Field(default=1.0, description="Trail deposit amount")
    decay_rate: float = Field(default=0.1, description="Trail decay rate")
    diffusion_rate: float = Field(default=0.5, description="Trail diffusion rate")

    # Simulation (algorithm)
    steps: int = Field(default=1000, description="Simulation steps")

    # Composition — nutrient layout and spatial constraints
    nutrient_layout: str = Field(
        default="central",
        description="central|ring|constellation|voronoi|bands|islands",
    )
    walls: str = Field(
        default="none",
        description="Boundary behavior: none|reflect|mask — composition walls",
    )
    mask: str = Field(
        default="none",
        description="Composition mask limiting deposit/render",
    )

    # Rendering / style
    palette: str = Field(default="void", description="Color palette")
    trail_threshold: float = Field(default=0.1, description="Trail rendering threshold")
    background: str = Field(default="", description="Intentional background token")
    pfl_style: str = Field(default="", description="PFL art-direction preset id")


def render(config: SlimeMoldConfig, ctx: RenderContext) -> RenderResult:
    """Render slime mold."""
    from numbrane_python.composition.grammar import background_rgb, composition_mask
    from numbrane_python.style.pfl import apply_style_to_params

    if config.pfl_style:
        raw = apply_style_to_params(config.pfl_style, config.model_dump())
        config = config.model_copy(
            update={k: raw[k] for k in ("palette", "background") if k in raw}
        )

    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    trail = np.zeros((ctx.height, ctx.width), dtype=np.float32)
    nutrient = _nutrient_field(ctx.width, ctx.height, config.nutrient_layout, int(config.seed))
    comp_mask = composition_mask(ctx.width, ctx.height, config.mask, seed=int(config.seed))

    rng = ctx.rng.generator
    agents = []
    for _ in range(config.num_agents):
        agents.append(
            {
                "x": rng.uniform(0, ctx.width),
                "y": rng.uniform(0, ctx.height),
                "angle": rng.uniform(0, 2 * np.pi),
            }
        )

    sensor_angle_rad = np.deg2rad(config.sensor_angle)
    rotation_angle_rad = np.deg2rad(config.rotation_angle)

    for _step in range(config.steps):
        for agent in agents:
            left_angle = agent["angle"] - sensor_angle_rad
            center_angle = agent["angle"]
            right_angle = agent["angle"] + sensor_angle_rad

            def sample_signal(x, y):
                ix = int(np.clip(x, 0, ctx.width - 1))
                iy = int(np.clip(y, 0, ctx.height - 1))
                return trail[iy, ix] + 0.35 * nutrient[iy, ix]

            left_x = agent["x"] + np.cos(left_angle) * config.sensor_distance
            left_y = agent["y"] + np.sin(left_angle) * config.sensor_distance
            left_val = sample_signal(left_x, left_y)

            center_x = agent["x"] + np.cos(center_angle) * config.sensor_distance
            center_y = agent["y"] + np.sin(center_angle) * config.sensor_distance
            center_val = sample_signal(center_x, center_y)

            right_x = agent["x"] + np.cos(right_angle) * config.sensor_distance
            right_y = agent["y"] + np.sin(right_angle) * config.sensor_distance
            right_val = sample_signal(right_x, right_y)

            if left_val > center_val and left_val > right_val:
                agent["angle"] -= rotation_angle_rad
            elif right_val > center_val and right_val > left_val:
                agent["angle"] += rotation_angle_rad

            agent["x"] += np.cos(agent["angle"]) * config.step_size
            agent["y"] += np.sin(agent["angle"]) * config.step_size

            if config.walls == "reflect":
                if agent["x"] < 0 or agent["x"] >= ctx.width:
                    agent["angle"] = np.pi - agent["angle"]
                    agent["x"] = np.clip(agent["x"], 0, ctx.width - 1)
                if agent["y"] < 0 or agent["y"] >= ctx.height:
                    agent["angle"] = -agent["angle"]
                    agent["y"] = np.clip(agent["y"], 0, ctx.height - 1)
            else:
                agent["x"] = agent["x"] % ctx.width
                agent["y"] = agent["y"] % ctx.height

            ix, iy = int(agent["x"]), int(agent["y"])
            if 0 <= ix < ctx.width and 0 <= iy < ctx.height:
                deposit = config.deposit_amount * (0.5 + 0.5 * nutrient[iy, ix])
                if comp_mask is None or comp_mask[iy, ix] >= 0.5:
                    trail[iy, ix] += deposit

        trail *= 1.0 - config.decay_rate
        if config.diffusion_rate > 0:
            from scipy import ndimage

            trail = ndimage.gaussian_filter(trail, sigma=config.diffusion_rate)

    palette_colors = get_palette(config.palette)
    trail_normalized = (trail - trail.min()) / (trail.max() - trail.min() + 1e-6)
    trail_normalized = np.clip(trail_normalized, 0, 1)
    if comp_mask is not None:
        trail_normalized = trail_normalized * comp_mask

    colors = gradient_map(trail_normalized, palette_colors)
    if config.background:
        bg = np.array(background_rgb(config.background), dtype=np.uint8)
        layer[:] = bg
        alpha = np.clip(trail_normalized[..., None], 0.0, 1.0)
        layer[:] = (
            layer.astype(np.float32) * (1.0 - alpha) + colors.astype(np.float32) * alpha
        ).astype(np.uint8)
    else:
        layer[:] = colors

    image = canvas.get_image()
    image = apply_vignette(image, 0.3)
    image = apply_bloom(image, intensity=0.4, threshold=0.3)

    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="slime_mold",
        config=config,
    )


def get_schema():
    """Get parameter schema."""
    from numbrane_python.params.schema import ParamSchema
    from numbrane_python.params.types import (
        IntParam,
        FloatParam,
        ColorParam,
    )

    return ParamSchema(
        name="slime_mold",
        description="Slime mold / Physarum-inspired agent simulation",
        params=[
            IntParam("num_agents", 1000, 20000, 5000, path="sim.count"),
            FloatParam("sensor_angle", 10.0, 90.0, 45.0, path="sim.sensor_angle"),
            FloatParam("sensor_distance", 1.0, 20.0, 9.0, path="sim.sensor_distance"),
            FloatParam("rotation_angle", 10.0, 90.0, 45.0, path="sim.rotation_angle"),
            FloatParam("step_size", 0.1, 5.0, 1.0, path="sim.step_size"),
            FloatParam("deposit_amount", 0.1, 5.0, 1.0, path="sim.deposit"),
            FloatParam("decay_rate", 0.01, 0.5, 0.1, path="sim.decay"),
            FloatParam("diffusion_rate", 0.0, 2.0, 0.5, path="sim.diffusion"),
            IntParam("steps", 100, 5000, 1000, path="sim.steps"),
            ColorParam("palette", "void", path="color.palette"),
        ],
    )


def defaults() -> dict:
    """Get default values."""
    config = SlimeMoldConfig()
    return config.model_dump()


def presets() -> dict:
    """Return curated presets."""
    return {
        "dense_web": {
            "num_agents": 10000,
            "steps": 2000,
            "deposit_amount": 2.0,
            "decay_rate": 0.05,
        },
        "sparse_tendrils": {
            "num_agents": 2000,
            "steps": 500,
            "sensor_distance": 15.0,
            "diffusion_rate": 1.0,
        },
    }
