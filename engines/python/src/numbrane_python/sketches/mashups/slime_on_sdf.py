from __future__ import annotations

"""Slime on SDF - schema definition."""

from pydantic import BaseModel, Field
from numbrane_python.params.schema import ParamSchema
from numbrane_python.params.types import (
    IntParam, FloatParam, BoolParam, ChoiceParam, ColorParam, AngleParam, Vec2Param,
)
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult


class SlimeOnSDFConfig(BaseModel):
    """Configuration for slime on SDF sketch."""
    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # Agent parameters
    num_agents: int = Field(default=5000)
    steps: int = Field(default=1000)
    sensor_angle: float = Field(default=45.0)
    sensor_distance: float = Field(default=9.0)
    rotation_angle: float = Field(default=45.0)
    step_size: float = Field(default=1.0)

    # Trail parameters
    deposit_amount: float = Field(default=1.0)
    decay_rate: float = Field(default=0.1)
    diffusion_rate: float = Field(default=0.5)

    # SDF parameters
    num_shapes: int = Field(default=10)
    shape_scale: float = Field(default=0.2)
    smoothness: float = Field(default=0.2)

    # Lighting
    light_dir: tuple = Field(default=(0.5, -0.5))
    ambient: float = Field(default=0.2)
    diffuse: float = Field(default=0.6)

    # Coupling
    trail_to_lighting: bool = Field(default=True)
    trail_lighting_strength: float = Field(default=1.0)

    # Rendering
    palette: str = Field(default="void")
    bloom_intensity: float = Field(default=0.4)


def get_schema() -> ParamSchema:
    """Get parameter schema."""
    return ParamSchema(
        name="slime_on_sdf",
        description="Physarum agents crawling over SDF surfaces with trail-based lighting",
        params=[
            IntParam("num_agents", 1000, 20000, 5000, path="sim.count"),
            IntParam("steps", 100, 5000, 1000, path="sim.steps"),
            AngleParam("sensor_angle", 10.0, 90.0, 45.0, path="sim.agent.sensor_angle"),
            FloatParam("sensor_distance", 1.0, 20.0, 9.0, path="sim.agent.sensor_distance"),
            AngleParam("rotation_angle", 10.0, 90.0, 45.0, path="sim.agent.rotation_angle"),
            FloatParam("step_size", 0.1, 5.0, 1.0, path="sim.agent.step_size"),
            FloatParam("deposit_amount", 0.1, 5.0, 1.0, path="sim.trail.deposit"),
            FloatParam("decay_rate", 0.01, 0.5, 0.1, path="sim.trail.decay"),
            FloatParam("diffusion_rate", 0.0, 2.0, 0.5, path="sim.trail.diffusion"),
            IntParam("num_shapes", 1, 50, 10, path="geom.sdf.num_shapes"),
            FloatParam("shape_scale", 0.05, 0.5, 0.2, path="geom.sdf.shape_scale"),
            FloatParam("smoothness", 0.0, 0.5, 0.2, path="geom.sdf.smoothness"),
            Vec2Param("light_dir", (-1.0, -1.0), (1.0, 1.0), (0.5, -0.5), path="composition.lighting.direction"),
            FloatParam("ambient", 0.0, 1.0, 0.2, path="composition.lighting.ambient"),
            FloatParam("diffuse", 0.0, 1.0, 0.6, path="composition.lighting.diffuse"),
            BoolParam("trail_to_lighting", True, path="composition.trail_to_lighting"),
            FloatParam("trail_lighting_strength", 0.0, 2.0, 1.0, path="composition.trail_lighting_strength"),
            ColorParam("palette", "void", path="color.palette"),
            FloatParam("bloom_intensity", 0.0, 1.0, 0.4, path="post.bloom.intensity"),
        ],
    )


def defaults() -> dict:
    """Get default values."""
    config = SlimeOnSDFConfig()
    return config.model_dump()


def render(config: SlimeOnSDFConfig, ctx: RenderContext) -> "RenderResult":
    """Render slime on SDF."""
    from numbrane_python.core.render_result import RenderResult
    from numbrane_python.render.canvas import Canvas
    from numbrane_python.render.palettes import get_palette, gradient_map
    from numbrane_python.render.postfx import apply_bloom
    import numpy as np

    canvas = Canvas(ctx.width, ctx.height, 3)

    # Create SDF scene
    x_norm = (np.arange(ctx.width, dtype=np.float64) / ctx.width - 0.5) * 2
    y_norm = (np.arange(ctx.height, dtype=np.float64) / ctx.height - 0.5) * 2
    x_grid, y_grid = np.meshgrid(x_norm, y_norm, indexing="xy")
    coords = np.stack([x_grid, y_grid], axis=-1)

    # Generate SDF shapes
    rng = ctx.rng.generator
    sdf = np.full((ctx.height, ctx.width), np.inf)

    for _ in range(config.num_shapes):
        center = np.array([
            rng.uniform(-0.8, 0.8),
            rng.uniform(-0.8, 0.8),
        ])
        radius = rng.uniform(0.1, 0.3) * config.shape_scale
        dist = np.linalg.norm(coords - center, axis=-1) - radius
        sdf = np.minimum(sdf, dist)

    # Smooth union
    if config.smoothness > 0:
        # Simplified smoothing
        from scipy import ndimage
        sdf = ndimage.gaussian_filter(sdf, sigma=config.smoothness * 10)

    # Compute normals for lighting
    eps = 0.01
    normal_x = np.gradient(sdf, axis=1)
    normal_y = np.gradient(sdf, axis=0)
    norm = np.sqrt(normal_x**2 + normal_y**2 + 1e-6)
    normal_x /= norm
    normal_y /= norm

    # SDF-based lighting
    light_dir = np.array(config.light_dir)
    light_dir = light_dir / (np.linalg.norm(light_dir) + 1e-6)
    dot = normal_x * light_dir[0] + normal_y * light_dir[1]
    lighting = config.ambient + config.diffuse * np.maximum(0, dot)

    # Render SDF base
    palette = get_palette(config.palette)
    sdf_layer = canvas.create_layer("sdf")
    sdf_mask = sdf < 0.02
    sdf_colors = gradient_map(lighting, palette)
    sdf_layer[sdf_mask] = sdf_colors[sdf_mask]

    # Initialize slime agents
    trail = np.zeros((ctx.height, ctx.width), dtype=np.float32)
    agents = []
    for _ in range(config.num_agents):
        agents.append({
            'x': rng.uniform(0, ctx.width),
            'y': rng.uniform(0, ctx.height),
            'angle': rng.uniform(0, 2 * np.pi),
        })

    # Slime simulation
    sensor_angle_rad = np.deg2rad(config.sensor_angle)
    rotation_angle_rad = np.deg2rad(config.rotation_angle)

    for step in range(config.steps):
        # Update agents
        for agent in agents:
            # Sample SDF gradient at agent position
            ax, ay = int(agent['x']), int(agent['y'])
            if 0 <= ax < ctx.width and 0 <= ay < ctx.height:
                # Follow SDF gradient (toward surface)
                grad_x = normal_x[ay, ax] if ay < ctx.height and ax < ctx.width else 0
                grad_y = normal_y[ay, ax] if ay < ctx.height and ax < ctx.width else 0

                # Turn toward gradient
                target_angle = np.arctan2(grad_y, grad_x)
                agent['angle'] = agent['angle'] * 0.9 + target_angle * 0.1

            # Sensor positions
            left_angle = agent['angle'] - sensor_angle_rad
            right_angle = agent['angle'] + sensor_angle_rad

            def sample_trail(x, y):
                ix, iy = int(np.clip(x, 0, ctx.width - 1)), int(np.clip(y, 0, ctx.height - 1))
                return trail[iy, ix]

            # Sample sensors
            left_x = agent['x'] + np.cos(left_angle) * config.sensor_distance
            left_y = agent['y'] + np.sin(left_angle) * config.sensor_distance
            left_val = sample_trail(left_x, left_y)

            center_x = agent['x'] + np.cos(agent['angle']) * config.sensor_distance
            center_y = agent['y'] + np.sin(agent['angle']) * config.sensor_distance
            center_val = sample_trail(center_x, center_y)

            right_x = agent['x'] + np.cos(right_angle) * config.sensor_distance
            right_y = agent['y'] + np.sin(right_angle) * config.sensor_distance
            right_val = sample_trail(right_x, right_y)

            # Turn toward highest trail
            if left_val > center_val and left_val > right_val:
                agent['angle'] -= rotation_angle_rad
            elif right_val > center_val and right_val > left_val:
                agent['angle'] += rotation_angle_rad

            # Move
            agent['x'] += np.cos(agent['angle']) * config.step_size
            agent['y'] += np.sin(agent['angle']) * config.step_size

            # Wrap bounds
            agent['x'] = agent['x'] % ctx.width
            agent['y'] = agent['y'] % ctx.height

            # Deposit trail
            ax, ay = int(agent['x']), int(agent['y'])
            if 0 <= ax < ctx.width and 0 <= ay < ctx.height:
                trail[ay, ax] += config.deposit_amount

        # Decay and diffuse trail
        trail *= (1.0 - config.decay_rate)
        if config.diffusion_rate > 0:
            from scipy import ndimage
            trail = ndimage.gaussian_filter(trail, sigma=config.diffusion_rate)

    # Render trail with lighting
    trail_layer = canvas.create_layer("trail")
    trail_mask = trail > 0.1
    if config.trail_to_lighting:
        # Use lighting for trail colors
        trail_colors = gradient_map(
            lighting * trail * config.trail_lighting_strength,
            palette
        )
    else:
        trail_colors = gradient_map(trail, palette)
    trail_layer[trail_mask] = trail_colors[trail_mask]

    # Composite
    image = canvas.get_image()

    # Apply bloom
    if config.bloom_intensity > 0:
        image = apply_bloom(image, config.bloom_intensity)

    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="slime_on_sdf",
        config=config,
    )


def presets() -> dict:
    """Return curated presets."""
    return {
        "glowing_colonization": {
            "num_agents": 10000,
            "deposit_amount": 2.0,
            "trail_to_lighting": True,
            "bloom_intensity": 0.6,
        },
        "subtle_crawling": {
            "deposit_amount": 0.5,
            "decay_rate": 0.2,
            "trail_lighting_strength": 0.5,
        },
        "neon_infestation": {
            "palette": "neon",
            "bloom_intensity": 0.8,
            "trail_lighting_strength": 1.5,
        },
    }
