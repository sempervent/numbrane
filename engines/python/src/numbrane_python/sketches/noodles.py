"""Field-advection noodles sketch."""

from typing import Dict
import numpy as np
from pydantic import BaseModel, Field
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult
from numbrane_python.core.config import sample_range
from numbrane_python.fields.vector import CurlNoiseField
from numbrane_python.sim.particles import Particle, ParticleSystem
from numbrane_python.sim.integrators import RK2Integrator
from numbrane_python.sim.emitters import BorderEmitter
from numbrane_python.render.canvas import Canvas
from numbrane_python.render.draw import draw_polyline, draw_gradient
from numbrane_python.render.palettes import get_palette
from numbrane_python.render.postfx import apply_vignette, apply_bloom, apply_film_grain


class NoodlesConfig(BaseModel):
    """Configuration for noodles sketch."""

    seed: int = Field(default=42, description="Random seed")
    width: int = Field(default=1920, description="Canvas width")
    height: int = Field(default=1080, description="Canvas height")

    # Field parameters
    field_scale: float = Field(default=0.5, description="Field scale")
    field_strength: float = Field(default=1.0, description="Field strength")
    field_octaves: int = Field(default=4, description="Noise octaves")

    # Particle parameters
    num_particles: int = Field(default=200, description="Number of particles")
    max_steps: int = Field(default=2000, description="Maximum simulation steps")
    dt: float = Field(default=0.1, description="Time step")
    particle_width: float = Field(default=2.0, description="Particle stroke width")
    width_variation: float = Field(default=0.5, description="Width variation")

    # Branching parameters
    branch_prob: float = Field(default=0.01, description="Branching probability per step")
    branch_threshold: float = Field(
        default=0.3, description="Field magnitude threshold for branching"
    )
    max_branches: int = Field(default=10, description="Maximum branches per particle")

    # Color parameters
    palette: str = Field(default="void", description="Color palette name")
    color_speed: float = Field(default=0.1, description="Color variation speed")

    # Background
    bg_color1: tuple = Field(default=(0, 0, 0), description="Background color 1")
    bg_color2: tuple = Field(default=(10, 10, 30), description="Background color 2")

    # Post-processing
    vignette_strength: float = Field(default=0.3, description="Vignette strength")
    bloom_intensity: float = Field(default=0.2, description="Bloom intensity")
    grain_strength: float = Field(default=0.05, description="Film grain strength")


def render(config: NoodlesConfig, ctx: RenderContext) -> RenderResult:
    """Render noodles sketch."""
    # Sample config ranges if needed
    field_scale = sample_range(config.field_scale, ctx.rng)
    field_strength = sample_range(config.field_strength, ctx.rng)
    branch_prob = sample_range(config.branch_prob, ctx.rng)

    # Create field
    curl_field = CurlNoiseField(
        scale=field_scale,
        strength=field_strength,
        octaves=config.field_octaves,
        seed=ctx.rng.seed,
    )

    # Create canvas
    canvas = Canvas(ctx.width, ctx.height, 3)

    # Draw background
    bg_layer = canvas.create_layer("background")
    draw_gradient(bg_layer, np.array(config.bg_color1), np.array(config.bg_color2))

    # Create particle system
    particle_system = ParticleSystem()
    integrator = RK2Integrator()

    # Emit particles
    bounds = (0, 0, ctx.width, ctx.height)
    emitter = BorderEmitter(
        width=config.particle_width,
        speed=1.0,
        color_idx=0,
    )
    initial_particles = emitter.emit(ctx.rng, config.num_particles, bounds)

    for p in initial_particles:
        particle_system.add(p)

    # Store particle trails
    trails: Dict[int, list] = {}
    for p in particle_system.particles:
        trails[p.branch_id] = [p.pos.copy()]

    # Simulation loop
    main_layer = canvas.create_layer("main")
    palette_colors = get_palette(config.palette)

    for step in range(config.max_steps):
        # Integrate particles
        integrator.step(particle_system.particles, curl_field, config.dt, step * config.dt)

        # Update trails and draw
        particles_to_remove = []
        for i, particle in enumerate(particle_system.particles):
            # Check bounds
            if (
                particle.pos[0] < 0
                or particle.pos[0] >= ctx.width
                or particle.pos[1] < 0
                or particle.pos[1] >= ctx.height
            ):
                particles_to_remove.append(i)
                continue

            # Add to trail
            if particle.branch_id not in trails:
                trails[particle.branch_id] = []
            trails[particle.branch_id].append(particle.pos.copy())

            # Limit trail length
            if len(trails[particle.branch_id]) > 100:
                trails[particle.branch_id].pop(0)

            # Branching
            if (
                len(particle_system.particles) < config.num_particles * 3
                and ctx.rng.random() < branch_prob
            ):
                # Check field magnitude
                vx, vy = curl_field.sample(
                    np.array([particle.pos[0]]), np.array([particle.pos[1]]), step * config.dt
                )
                field_mag = np.sqrt(vx[0] ** 2 + vy[0] ** 2)

                if field_mag > config.branch_threshold:
                    # Create branch
                    branch_id = particle_system.get_new_branch_id()
                    angle = ctx.rng.uniform(0, 2 * np.pi)
                    speed = ctx.rng.uniform(0.5, 1.5)

                    new_particle = Particle(
                        pos=particle.pos.copy(),
                        vel=np.array(
                            [np.cos(angle) * speed, np.sin(angle) * speed], dtype=np.float32
                        ),
                        age=0.0,
                        width=particle.width * ctx.rng.uniform(0.7, 1.0),
                        color_idx=(particle.color_idx + 1) % len(palette_colors),
                        branch_id=branch_id,
                        parent_id=particle.branch_id,
                    )
                    particle_system.add(new_particle)
                    trails[branch_id] = [new_particle.pos.copy()]

        # Remove out-of-bounds particles
        for idx in reversed(particles_to_remove):
            particle_system.remove(idx)

        # Draw trails periodically
        if step % 10 == 0:
            for branch_id, trail in trails.items():
                if len(trail) < 2:
                    continue

                particle = next(
                    (p for p in particle_system.particles if p.branch_id == branch_id), None
                )
                if particle is None:
                    continue

                # Color based on age/position
                color_idx = particle.color_idx
                color = np.array(palette_colors[color_idx % len(palette_colors)], dtype=np.uint8)

                # Width variation
                width = particle.width * (1.0 + config.width_variation * ctx.rng.uniform(-1, 1))

                # Draw trail
                trail_array = np.array(trail)
                draw_polyline(main_layer, trail_array, width, color, antialias=True)

    # Composite layers
    image = canvas.composite_layers(["background", "main"])

    # Post-processing
    if config.vignette_strength > 0:
        image = apply_vignette(image, config.vignette_strength)
    if config.bloom_intensity > 0:
        image = apply_bloom(image, intensity=config.bloom_intensity)
    if config.grain_strength > 0:
        image = apply_film_grain(image, config.grain_strength, ctx.rng.seed)

    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="noodles",
        config=config,
    )


def animate(config: NoodlesConfig, ctx: RenderContext):
    """Animate noodles sketch."""
    from numbrane_python.core.render_result import FrameResult

    num_frames = 60  # Default
    for frame in range(num_frames):
        frame_ctx = ctx.fork(frame=frame, time=frame / num_frames)
        result = render(config, frame_ctx)
        yield FrameResult(result.image, frame, frame / num_frames)


def param_space():
    """Define parameter space for noodles sketch."""
    from numbrane_python.paramspace import ParamSpace, FloatParam, IntParam, ColorParam

    return ParamSpace(
        params=[
            FloatParam("field_scale", 0.1, 2.0, 0.5, description="Field scale"),
            FloatParam("field_strength", 0.1, 3.0, 1.0, description="Field strength"),
            IntParam("field_octaves", 1, 8, 4, description="Noise octaves"),
            IntParam("num_particles", 50, 500, 200, description="Number of particles"),
            IntParam("max_steps", 500, 5000, 2000, description="Max simulation steps"),
            FloatParam("dt", 0.01, 0.5, 0.1, description="Time step"),
            FloatParam("particle_width", 0.5, 5.0, 2.0, description="Particle width"),
            FloatParam("branch_prob", 0.0, 0.1, 0.01, description="Branching probability"),
            FloatParam("branch_threshold", 0.0, 1.0, 0.3, description="Branch threshold"),
            ColorParam("palette", "void", description="Color palette"),
        ],
        conditions=[],
        constraints=[],
    )


def presets() -> dict:
    """Return curated presets."""
    return {
        "dense": {
            "num_particles": 400,
            "max_steps": 3000,
            "field_scale": 0.3,
        },
        "sparse": {
            "num_particles": 100,
            "max_steps": 1000,
            "field_scale": 0.8,
        },
        "chaotic": {
            "field_strength": 2.5,
            "branch_prob": 0.05,
            "field_octaves": 6,
        },
    }
