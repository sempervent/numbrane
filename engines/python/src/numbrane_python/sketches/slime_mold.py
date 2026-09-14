"""Slime mold / Physarum-inspired sketch."""

import numpy as np
from pydantic import BaseModel, Field
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult
from numbrane_python.render.canvas import Canvas
from numbrane_python.render.palettes import get_palette, gradient_map
from numbrane_python.render.postfx import apply_vignette, apply_bloom


class SlimeMoldConfig(BaseModel):
    """Configuration for slime mold sketch."""

    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # Agent parameters
    num_agents: int = Field(default=5000, description="Number of agents")
    sensor_angle: float = Field(default=45.0, description="Sensor angle (degrees)")
    sensor_distance: float = Field(default=9.0, description="Sensor distance")
    rotation_angle: float = Field(default=45.0, description="Rotation angle (degrees)")
    step_size: float = Field(default=1.0, description="Step size")

    # Trail parameters
    deposit_amount: float = Field(default=1.0, description="Trail deposit amount")
    decay_rate: float = Field(default=0.1, description="Trail decay rate")
    diffusion_rate: float = Field(default=0.5, description="Trail diffusion rate")

    # Simulation
    steps: int = Field(default=1000, description="Simulation steps")

    # Rendering
    palette: str = Field(default="void", description="Color palette")
    trail_threshold: float = Field(default=0.1, description="Trail rendering threshold")


def render(config: SlimeMoldConfig, ctx: RenderContext) -> RenderResult:
    """Render slime mold."""
    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    # Initialize trail map
    trail = np.zeros((ctx.height, ctx.width), dtype=np.float32)

    # Initialize agents
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

    # Simulation
    sensor_angle_rad = np.deg2rad(config.sensor_angle)
    rotation_angle_rad = np.deg2rad(config.rotation_angle)

    for step in range(config.steps):
        # Update agents
        for agent in agents:
            # Sensor positions
            left_angle = agent["angle"] - sensor_angle_rad
            center_angle = agent["angle"]
            right_angle = agent["angle"] + sensor_angle_rad

            def sample_trail(x, y):
                """Sample trail at position."""
                ix, iy = int(np.clip(x, 0, ctx.width - 1)), int(np.clip(y, 0, ctx.height - 1))
                return trail[iy, ix]

            # Sample sensors
            left_x = agent["x"] + np.cos(left_angle) * config.sensor_distance
            left_y = agent["y"] + np.sin(left_angle) * config.sensor_distance
            left_val = sample_trail(left_x, left_y)

            center_x = agent["x"] + np.cos(center_angle) * config.sensor_distance
            center_y = agent["y"] + np.sin(center_angle) * config.sensor_distance
            center_val = sample_trail(center_x, center_y)

            right_x = agent["x"] + np.cos(right_angle) * config.sensor_distance
            right_y = agent["y"] + np.sin(right_angle) * config.sensor_distance
            right_val = sample_trail(right_x, right_y)

            # Turn toward highest trail
            if left_val > center_val and left_val > right_val:
                agent["angle"] -= rotation_angle_rad
            elif right_val > center_val and right_val > left_val:
                agent["angle"] += rotation_angle_rad

            # Move
            agent["x"] += np.cos(agent["angle"]) * config.step_size
            agent["y"] += np.sin(agent["angle"]) * config.step_size

            # Wrap bounds
            agent["x"] = agent["x"] % ctx.width
            agent["y"] = agent["y"] % ctx.height

            # Deposit trail
            ix, iy = int(agent["x"]), int(agent["y"])
            if 0 <= ix < ctx.width and 0 <= iy < ctx.height:
                trail[iy, ix] += config.deposit_amount

        # Decay and diffuse trail
        trail *= 1.0 - config.decay_rate

        # Simple diffusion (Gaussian blur approximation)
        if config.diffusion_rate > 0:
            from scipy import ndimage

            trail = ndimage.gaussian_filter(trail, sigma=config.diffusion_rate)

    # Render trail
    palette_colors = get_palette(config.palette)
    trail_normalized = (trail - trail.min()) / (trail.max() - trail.min() + 1e-6)
    trail_normalized = np.clip(trail_normalized, 0, 1)

    colors = gradient_map(trail_normalized, palette_colors)
    layer[:] = colors

    image = canvas.get_image()

    # Post-processing
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
