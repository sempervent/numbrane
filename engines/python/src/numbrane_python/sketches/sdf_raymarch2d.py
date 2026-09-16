"""Signed-distance field 2D raymarch sketch."""

import numpy as np
from pydantic import BaseModel, Field
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult
from numbrane_python.fields.scalar import NoiseField
from numbrane_python.render.canvas import Canvas
from numbrane_python.render.palettes import get_palette, gradient_map


class SDFRaymarch2DConfig(BaseModel):
    """Configuration for SDF raymarch sketch."""

    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # SDF parameters
    num_shapes: int = Field(default=20, description="Number of SDF shapes")
    shape_scale: float = Field(default=0.1)
    noise_scale: float = Field(default=0.05)

    # Lighting
    light_dir: tuple = Field(default=(0.5, -0.5), description="Light direction")
    ambient: float = Field(default=0.3)
    diffuse: float = Field(default=0.7)

    # Rendering
    palette: str = Field(default="void")


def sdf_circle(p: np.ndarray, center: np.ndarray, radius: float) -> np.ndarray:
    """Circle SDF."""
    return np.linalg.norm(p - center, axis=-1) - radius


def sdf_box(p: np.ndarray, center: np.ndarray, size: np.ndarray) -> np.ndarray:
    """Box SDF."""
    d = np.abs(p - center) - size
    return np.linalg.norm(np.maximum(d, 0), axis=-1) + np.minimum(np.max(d, axis=-1), 0)


def smooth_union(a: np.ndarray, b: np.ndarray, k: float = 0.1) -> np.ndarray:
    """Smooth union of SDFs."""
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return (1 - h) * b + h * a - k * h * (1 - h)


def render(config: SDFRaymarch2DConfig, ctx: RenderContext) -> RenderResult:
    """Render SDF raymarch."""
    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    # Create coordinate grid
    y, x = np.ogrid[: ctx.height, : ctx.width]
    x_norm = np.broadcast_to((x / ctx.width - 0.5) * 2, (ctx.height, ctx.width))
    y_norm = np.broadcast_to((y / ctx.height - 0.5) * 2, (ctx.height, ctx.width))
    coords = np.stack([x_norm, y_norm], axis=-1)

    # Generate SDF shapes
    rng = ctx.rng.generator
    shapes = []
    for _ in range(config.num_shapes):
        shape_type = rng.choice(["circle", "box"])
        center = np.array(
            [
                rng.uniform(-0.8, 0.8),
                rng.uniform(-0.8, 0.8),
            ]
        )
        if shape_type == "circle":
            radius = rng.uniform(0.1, 0.3)
            shapes.append(("circle", center, radius))
        else:
            size = np.array([rng.uniform(0.1, 0.3), rng.uniform(0.1, 0.3)])
            shapes.append(("box", center, size))

    # Compute SDF
    sdf = np.full((ctx.height, ctx.width), np.inf)
    for shape_type, center, params in shapes:
        if shape_type == "circle":
            dist = sdf_circle(coords, center, params)
        else:
            dist = sdf_box(coords, center, params)
        sdf = smooth_union(sdf, dist, k=0.1)

    # Add noise
    noise_field = NoiseField(scale=config.noise_scale, seed=ctx.rng.seed)
    noise = noise_field.sample(x_norm, y_norm)
    sdf += noise * 0.05

    # Compute normals (for lighting)
    eps = 0.01
    sdf_x = sdf_circle(
        coords + np.array([eps, 0]), shapes[0][1], shapes[0][2] if shapes[0][0] == "circle" else 0.1
    )
    sdf_y = sdf_circle(
        coords + np.array([0, eps]), shapes[0][1], shapes[0][2] if shapes[0][0] == "circle" else 0.1
    )

    # Simplified normal computation
    normal_x = np.gradient(sdf, axis=1)
    normal_y = np.gradient(sdf, axis=0)
    norm = np.sqrt(normal_x**2 + normal_y**2 + 1e-6)
    normal_x /= norm
    normal_y /= norm

    # Lighting
    light_dir = np.array(config.light_dir)
    light_dir = light_dir / (np.linalg.norm(light_dir) + 1e-6)

    dot = normal_x * light_dir[0] + normal_y * light_dir[1]
    lighting = config.ambient + config.diffuse * np.clip(dot, 0, 1)

    # Map SDF to colors
    sdf_normalized = np.clip((sdf + 0.2) / 0.4, 0, 1)
    palette_colors = get_palette(config.palette)
    colors = gradient_map(sdf_normalized, palette_colors)

    # Apply lighting — keep a visible floor for Studio GENERATE previews
    lit = colors.astype(np.float32) * lighting[..., np.newaxis]
    colors = np.clip(lit + 18.0, 18, 255).astype(np.uint8)
    layer[:] = colors

    image = canvas.get_image()

    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="sdf_raymarch2d",
        config=config,
    )
