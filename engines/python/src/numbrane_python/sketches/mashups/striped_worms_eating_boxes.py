from __future__ import annotations

"""Striped worms eating boxes - schema definition."""

from pydantic import BaseModel, Field
from numbrane_python.params.schema import ParamSchema
from numbrane_python.params.types import (
    IntParam, FloatParam, BoolParam, ChoiceParam, ColorParam,
)
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult


class StripedWormsEatingBoxesConfig(BaseModel):
    """Configuration for striped worms eating boxes sketch."""
    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # Particle/worm parameters
    num_worms: int = Field(default=30)
    max_steps: int = Field(default=2000)
    dt: float = Field(default=0.1)
    field_scale: float = Field(default=0.5)
    field_strength: float = Field(default=1.0)

    # Grid parameters
    grid_resolution: int = Field(default=30)
    box_size: float = Field(default=40.0)

    # Worm parameters
    worm_girth: float = Field(default=8.0)
    striping_frequency: float = Field(default=2.0)
    striping_phase: float = Field(default=0.0)

    # Collision parameters
    digestion_rate: float = Field(default=0.1)
    deformation_strength: float = Field(default=0.3)

    # Rendering
    palette: str = Field(default="void")
    invert_at_boundary: bool = Field(default=True)
    bloom_intensity: float = Field(default=0.2)


def get_schema() -> ParamSchema:
    """Get parameter schema."""
    return ParamSchema(
        name="striped_worms_eating_boxes",
        description="Particle worms with stripes that consume and deform a discrete grid",
        params=[
            IntParam("num_worms", 10, 100, 30, path="sim.count"),
            IntParam("max_steps", 500, 5000, 2000, path="sim.steps"),
            FloatParam("dt", 0.01, 0.5, 0.1, path="sim.dt"),
            FloatParam("field_scale", 0.1, 2.0, 0.5, path="field.scale"),
            FloatParam("field_strength", 0.1, 3.0, 1.0, path="field.strength"),
            IntParam("grid_resolution", 10, 100, 30, path="geom.grid.resolution"),
            FloatParam("box_size", 10.0, 100.0, 40.0, path="geom.grid.box_size"),
            FloatParam("worm_girth", 2.0, 20.0, 8.0, path="geom.worm.girth"),
            FloatParam("striping_frequency", 0.5, 10.0, 2.0, path="geom.worm.striping.frequency"),
            FloatParam("striping_phase", 0.0, 1.0, 0.0, path="geom.worm.striping.phase"),
            FloatParam("digestion_rate", 0.0, 1.0, 0.1, path="sim.collision.digestion_rate"),
            FloatParam("deformation_strength", 0.0, 1.0, 0.3, path="sim.collision.deformation_strength"),
            ColorParam("palette", "void", path="color.palette"),
            BoolParam("invert_at_boundary", True, path="color.inversion.at_boundary"),
            FloatParam("bloom_intensity", 0.0, 1.0, 0.2, path="post.bloom.intensity"),
        ],
    )


def defaults() -> dict:
    """Get default values."""
    config = StripedWormsEatingBoxesConfig()
    return config.model_dump()


def presets() -> dict:
    """Return curated presets."""
    return {
        "voracious_swarm": {
            "num_worms": 80,
            "digestion_rate": 0.3,
            "grid_resolution": 50,
        },
        "gentle_erosion": {
            "digestion_rate": 0.05,
            "deformation_strength": 0.6,
            "num_worms": 15,
        },
        "neon_invasion": {
            "palette": "neon",
            "bloom_intensity": 0.6,
            "invert_at_boundary": True,
        },
    }


def render(config: StripedWormsEatingBoxesConfig, ctx: RenderContext) -> "RenderResult":
    """Render striped worms eating boxes."""
    from numbrane_python.core.render_result import RenderResult
    from numbrane_python.render.canvas import Canvas
    from numbrane_python.render.draw import draw_polyline, draw_circle
    from numbrane_python.render.palettes import get_palette, gradient_map
    from numbrane_python.render.postfx import apply_bloom
    from numbrane_python.fields.vector import CurlNoiseField
    from numbrane_python.sim.particles import Particle, ParticleSystem
    from numbrane_python.sim.integrators import RK2Integrator
    import numpy as np

    # Create field for worm movement
    field = CurlNoiseField(
        scale=config.field_scale,
        strength=config.field_strength,
        octaves=4,
        seed=ctx.rng.seed,
    )

    # Create canvas
    canvas = Canvas(ctx.width, ctx.height, 3)

    # Initialize grid of boxes
    grid = np.ones((config.grid_resolution, config.grid_resolution), dtype=float)
    box_w = ctx.width / config.grid_resolution
    box_h = ctx.height / config.grid_resolution

    # Create particle system for worms
    particle_system = ParticleSystem()
    integrator = RK2Integrator()

    # Initialize worms
    for i in range(config.num_worms):
        x = ctx.rng.random() * ctx.width
        y = ctx.rng.random() * ctx.height
        p = Particle(
            pos=np.array([x, y], dtype=float),
            vel=np.array([0.0, 0.0], dtype=float),
            age=0.0,
            width=config.worm_girth,
            color_idx=i % 2,
            branch_id=i,
        )
        particle_system.add(p)

    # Store trails
    trails = {i: [] for i in range(config.num_worms)}

    # Simulation
    for step in range(config.max_steps):
        integrator.step(particle_system.particles, field, config.dt, step * config.dt)
        for p in particle_system.particles:
            p.vel *= 0.98
            trails[p.branch_id].append(p.pos.copy())
            grid_x = int(p.pos[0] / box_w)
            grid_y = int(p.pos[1] / box_h)
            if 0 <= grid_x < config.grid_resolution and 0 <= grid_y < config.grid_resolution:
                grid[grid_y, grid_x] = max(0.0, grid[grid_y, grid_x] - config.digestion_rate)

    # Draw boxes
    palette = get_palette(config.palette)
    for y in range(config.grid_resolution):
        for x in range(config.grid_resolution):
            if grid[y, x] > 0:
                box_x = x * box_w
                box_y = y * box_h
                size = config.box_size * grid[y, x]
                color = palette[int(grid[y, x] * (len(palette) - 1))]
                # Draw box as rectangle (simplified)
                from numbrane_python.render.draw import draw_line
                box_layer = canvas.create_layer("boxes")
                box_color = np.array(color, dtype=np.uint8)
                # Draw box outline
                for i in range(int(size)):
                    if box_x + i < ctx.width and box_y + i < ctx.height:
                        box_layer[int(box_y + i), int(box_x + i)] = box_color

    worm_layer = canvas.create_layer("worms")

    # Draw worms with stripes
    for worm_id, trail in trails.items():
        if len(trail) < 2:
            continue

        # Create striped pattern
        for i in range(len(trail) - 1):
            dist = np.linalg.norm(trail[i+1] - trail[0])
            stripe = np.sin(dist * config.striping_frequency + config.striping_phase) > 0
            color_idx = 0 if stripe else 1
            color = palette[color_idx % len(palette)]

            # Draw segment
            draw_polyline(
                worm_layer,
                np.array([trail[i], trail[i + 1]]),
                config.worm_girth,
                color,
            )

    # Apply post-processing
    image = canvas.get_image()
    if config.bloom_intensity > 0:
        image = apply_bloom(image, config.bloom_intensity)

    return RenderResult(
        image=image,
        seed=config.seed,
        sketch_name="striped_worms_eating_boxes",
        config=config,
    )
