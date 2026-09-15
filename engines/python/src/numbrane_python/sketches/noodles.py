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

    # Field parameters (algorithm)
    field_scale: float = Field(default=0.5, description="Field scale")
    field_strength: float = Field(default=1.0, description="Field strength")
    field_octaves: int = Field(default=4, description="Noise octaves")

    # Particle parameters (algorithm)
    num_particles: int = Field(default=200, description="Number of particles")
    max_steps: int = Field(default=2000, description="Maximum simulation steps")
    dt: float = Field(default=0.1, description="Time step")
    particle_width: float = Field(default=2.0, description="Particle stroke width")
    width_variation: float = Field(default=0.5, description="Width variation")

    # Branching parameters (algorithm)
    branch_prob: float = Field(default=0.01, description="Branching probability per step")
    branch_threshold: float = Field(
        default=0.3, description="Field magnitude threshold for branching"
    )
    max_branches: int = Field(default=10, description="Maximum branches per particle")

    # Composition — static render accumulation
    trail_persistence: float = Field(
        default=0.92,
        ge=0.0,
        le=1.0,
        description="Accumulation layer fade per draw (1 = full persistence)",
    )
    width_hierarchy: float = Field(
        default=0.75,
        ge=0.3,
        le=1.0,
        description="Child branch width scale vs parent",
    )
    density: float = Field(default=1.0, description="Sparse/dense draw multiplier")

    # Color / style
    palette: str = Field(default="void", description="Color palette name")
    color_speed: float = Field(default=0.1, description="Color variation speed")
    background: str = Field(default="", description="Intentional background token")
    pfl_style: str = Field(default="", description="PFL art-direction preset id")

    # Legacy gradient background (used when background token empty)
    bg_color1: tuple = Field(default=(0, 0, 0), description="Background color 1")
    bg_color2: tuple = Field(default=(10, 10, 30), description="Background color 2")

    # Post-processing
    vignette_strength: float = Field(default=0.3, description="Vignette strength")
    bloom_intensity: float = Field(default=0.2, description="Bloom intensity")
    grain_strength: float = Field(default=0.05, description="Film grain strength")


def render(config: NoodlesConfig, ctx: RenderContext) -> RenderResult:
    """Render noodles sketch."""
    from numbrane_python.composition.grammar import background_rgb
    from numbrane_python.style.pfl import apply_style_to_params

    if config.pfl_style:
        raw = apply_style_to_params(config.pfl_style, config.model_dump())
        config = config.model_copy(
            update={
                k: raw[k]
                for k in (
                    "palette",
                    "background",
                    "density",
                    "bloom_intensity",
                    "vignette_strength",
                )
                if k in raw
            }
        )

    field_scale = sample_range(config.field_scale, ctx.rng)
    field_strength = sample_range(config.field_strength, ctx.rng)
    branch_prob = sample_range(config.branch_prob, ctx.rng) * config.density

    curl_field = CurlNoiseField(
        scale=field_scale,
        strength=field_strength,
        octaves=config.field_octaves,
        seed=ctx.rng.seed,
    )

    canvas = Canvas(ctx.width, ctx.height, 3)
    bg_layer = canvas.create_layer("background")
    if config.background:
        bg_layer[:] = background_rgb(config.background)
    else:
        draw_gradient(bg_layer, np.array(config.bg_color1), np.array(config.bg_color2))

    accum_layer = canvas.create_layer("accum")
    accum_layer[:] = bg_layer[:]
    main_layer = canvas.create_layer("main")

    particle_system = ParticleSystem()
    integrator = RK2Integrator()
    bounds = (0, 0, ctx.width, ctx.height)
    emitter = BorderEmitter(
        width=config.particle_width,
        speed=1.0,
        color_idx=0,
    )
    num_spawn = max(1, int(config.num_particles * config.density))
    initial_particles = emitter.emit(ctx.rng, num_spawn, bounds)
    for p in initial_particles:
        particle_system.add(p)

    trails: Dict[int, list] = {}
    branch_depth: Dict[int, int] = {}
    for p in particle_system.particles:
        trails[p.branch_id] = [p.pos.copy()]
        branch_depth[p.branch_id] = 0

    palette_colors = get_palette(config.palette)
    draw_stride = max(1, int(round(1.0 / max(config.density, 0.25))))

    for step in range(config.max_steps):
        integrator.step(particle_system.particles, curl_field, config.dt, step * config.dt)

        particles_to_remove = []
        for i, particle in enumerate(particle_system.particles):
            if (
                particle.pos[0] < 0
                or particle.pos[0] >= ctx.width
                or particle.pos[1] < 0
                or particle.pos[1] >= ctx.height
            ):
                particles_to_remove.append(i)
                continue

            if particle.branch_id not in trails:
                trails[particle.branch_id] = []
                branch_depth[particle.branch_id] = 0
            trails[particle.branch_id].append(particle.pos.copy())

            max_trail = int(80 + 120 * config.density)
            if len(trails[particle.branch_id]) > max_trail:
                trails[particle.branch_id].pop(0)

            if len(particle_system.particles) < num_spawn * 3 and ctx.rng.random() < branch_prob:
                vx, vy = curl_field.sample(
                    np.array([particle.pos[0]]), np.array([particle.pos[1]]), step * config.dt
                )
                field_mag = np.sqrt(vx[0] ** 2 + vy[0] ** 2)
                if field_mag > config.branch_threshold:
                    branch_id = particle_system.get_new_branch_id()
                    depth = branch_depth.get(particle.branch_id, 0) + 1
                    branch_depth[branch_id] = depth
                    angle = ctx.rng.uniform(0, 2 * np.pi)
                    speed = ctx.rng.uniform(0.5, 1.5)
                    child_width = particle.width * (config.width_hierarchy**depth)
                    new_particle = Particle(
                        pos=particle.pos.copy(),
                        vel=np.array(
                            [np.cos(angle) * speed, np.sin(angle) * speed], dtype=np.float32
                        ),
                        age=0.0,
                        width=child_width * ctx.rng.uniform(0.85, 1.0),
                        color_idx=(particle.color_idx + 1) % len(palette_colors),
                        branch_id=branch_id,
                        parent_id=particle.branch_id,
                    )
                    particle_system.add(new_particle)
                    trails[branch_id] = [new_particle.pos.copy()]

        for idx in reversed(particles_to_remove):
            particle_system.remove(idx)

        if step % draw_stride == 0:
            fade = float(np.clip(config.trail_persistence, 0.0, 1.0))
            if fade < 1.0:
                accum_layer[:] = (
                    accum_layer.astype(np.float32) * fade
                    + bg_layer.astype(np.float32) * (1.0 - fade)
                ).astype(np.uint8)

            for branch_id, trail in trails.items():
                if len(trail) < 2:
                    continue
                particle = next(
                    (p for p in particle_system.particles if p.branch_id == branch_id), None
                )
                if particle is None:
                    continue
                color_idx = particle.color_idx
                color = np.array(palette_colors[color_idx % len(palette_colors)], dtype=np.uint8)
                depth = branch_depth.get(branch_id, 0)
                hierarchy_scale = config.width_hierarchy**depth
                width = (
                    particle.width
                    * hierarchy_scale
                    * (1.0 + config.width_variation * ctx.rng.uniform(-0.5, 0.5))
                )
                trail_array = np.array(trail)
                draw_polyline(accum_layer, trail_array, width, color, antialias=True)

    main_layer[:] = accum_layer[:]
    image = canvas.composite_layers(["background", "main"])

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

    num_frames = 60
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
            "density": 1.4,
            "trail_persistence": 0.96,
        },
        "sparse": {
            "num_particles": 100,
            "max_steps": 1000,
            "field_scale": 0.8,
            "density": 0.55,
            "trail_persistence": 0.88,
        },
        "chaotic": {
            "field_strength": 2.5,
            "branch_prob": 0.05,
            "field_octaves": 6,
        },
    }
