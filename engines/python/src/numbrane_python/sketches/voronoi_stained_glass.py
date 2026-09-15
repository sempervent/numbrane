"""Voronoi stained glass sketch."""

import numpy as np
from pydantic import BaseModel, Field
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult
from numbrane_python.render.canvas import Canvas
from numbrane_python.render.palettes import get_palette, gradient_map
from numbrane_python.render.postfx import apply_vignette, apply_bloom
from numbrane_python.render.draw import draw_line


def _voronoi_sites(
    num_points: int,
    distribution: str,
    seed: int,
    rng: np.random.Generator,
) -> np.ndarray:
    """Site placement — composition only; distance field math unchanged."""
    if distribution == "uniform":
        return np.array([[rng.uniform(0, 1), rng.uniform(0, 1)] for _ in range(num_points)])

    if distribution == "clustered":
        k = max(2, num_points // 6)
        centers = rng.uniform(0.2, 0.8, (k, 2))
        pts = []
        for _ in range(num_points):
            c = centers[rng.integers(0, k)]
            pts.append(c + rng.normal(0, 0.06, 2))
        return np.clip(np.array(pts), 0.02, 0.98)

    if distribution == "ring":
        pts = []
        n_ring = max(4, num_points - 1)
        for i in range(n_ring):
            a = (i / n_ring) * 2 * np.pi + seed * 0.01
            r = 0.28 + (seed % 5) * 0.02
            pts.append([0.5 + np.cos(a) * r, 0.5 + np.sin(a) * r])
        pts.append([0.5, 0.5])
        while len(pts) < num_points:
            pts.append([rng.uniform(0.15, 0.85), rng.uniform(0.15, 0.85)])
        return np.array(pts[:num_points])

    if distribution == "bands":
        pts = []
        rows = max(2, int(np.sqrt(num_points)))
        for i in range(num_points):
            row = i % rows
            col = i // rows
            x = (col + rng.uniform(-0.08, 0.08)) / max(rows, 1)
            y = (row + rng.uniform(-0.08, 0.08)) / max(rows, 1)
            pts.append([np.clip(x, 0.05, 0.95), np.clip(y, 0.05, 0.95)])
        return np.array(pts)

    if distribution == "geometry":
        from numbrane_python.composition.grammar import composition_mask

        w = h = 256
        mask = composition_mask(w, h, "circle", seed=seed)
        ys, xs = np.where(mask > 0.5) if mask is not None else (np.array([]), np.array([]))
        pts = []
        if len(xs) > 0:
            pick = rng.choice(len(xs), size=min(num_points, len(xs)), replace=len(xs) < num_points)
            for ix, iy in zip(xs[pick], ys[pick], strict=False):
                pts.append([ix / w, iy / h])
        while len(pts) < num_points:
            pts.append([rng.uniform(0, 1), rng.uniform(0, 1)])
        return np.array(pts[:num_points])

    if distribution == "field":
        pts = []
        for _ in range(num_points * 3):
            x, y = rng.uniform(0, 1), rng.uniform(0, 1)
            w = np.sin(x * 12 + seed * 0.02) * np.cos(y * 10 - seed * 0.015)
            if w > 0.15:
                pts.append([x, y])
            if len(pts) >= num_points:
                break
        while len(pts) < num_points:
            pts.append([rng.uniform(0, 1), rng.uniform(0, 1)])
        return np.array(pts[:num_points])

    return np.array([[rng.uniform(0, 1), rng.uniform(0, 1)] for _ in range(num_points)])


class VoronoiStainedGlassConfig(BaseModel):
    """Configuration for Voronoi stained glass sketch."""

    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # Voronoi parameters (algorithm)
    voronoi_scale: float = Field(default=0.02, description="Voronoi cell scale")
    num_points: int = Field(default=50, description="Number of Voronoi points")
    edge_width: float = Field(default=2.0, description="Edge line width")
    edge_color: tuple = Field(default=(0, 0, 0), description="Edge color (R, G, B)")

    # Composition — site placement
    site_distribution: str = Field(
        default="uniform",
        description="uniform|clustered|ring|bands|geometry|field",
    )

    # Stylization / style
    palette: str = Field(default="void", description="Color palette")
    noise_scale: float = Field(default=0.01, description="Noise scale for variation")
    warp_strength: float = Field(default=0.2, description="Domain warp strength")
    background: str = Field(default="", description="Intentional background token")
    pfl_style: str = Field(default="", description="PFL art-direction preset id")

    # Post-processing
    bloom_intensity: float = Field(default=0.12, description="Bloom intensity")
    vignette_strength: float = Field(default=0.2, description="Vignette strength")


def render(config: VoronoiStainedGlassConfig, ctx: RenderContext) -> RenderResult:
    """Render Voronoi stained glass."""
    from numbrane_python.composition.grammar import background_rgb
    from numbrane_python.style.pfl import apply_style_to_params

    if config.pfl_style:
        raw = apply_style_to_params(config.pfl_style, config.model_dump())
        config = config.model_copy(
            update={
                k: raw[k]
                for k in ("palette", "background", "bloom_intensity", "vignette_strength")
                if k in raw
            }
        )

    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    yy, xx = np.mgrid[0 : ctx.height, 0 : ctx.width]
    x_norm = xx / max(ctx.width, 1)
    y_norm = yy / max(ctx.height, 1)

    rng = ctx.rng.generator
    points = _voronoi_sites(config.num_points, config.site_distribution, int(config.seed), rng)

    flat = np.stack([x_norm.ravel(), y_norm.ravel()], axis=1)
    dists = ((flat[:, None, :] - points[None, :, :]) ** 2).sum(axis=2)
    nearest = np.argmin(dists, axis=1)
    cell_ids = nearest.reshape(ctx.height, ctx.width)
    voronoi = np.sqrt(dists[np.arange(dists.shape[0]), nearest]).reshape(ctx.height, ctx.width)
    voronoi = voronoi / max(float(voronoi.max()), 1e-6)

    palette_colors = get_palette(config.palette)
    colors = gradient_map(voronoi, palette_colors)

    if config.background:
        bg = np.array(background_rgb(config.background), dtype=np.uint8)
        layer[:] = bg
        alpha = np.clip(voronoi[..., None], 0.15, 1.0)
        layer[:] = (
            layer.astype(np.float32) * (1.0 - alpha) + colors.astype(np.float32) * alpha
        ).astype(np.uint8)
    else:
        layer[:] = colors

    edge_layer = canvas.create_layer("edges")
    for i in range(1, ctx.height - 1):
        for j in range(1, ctx.width - 1):
            if (
                cell_ids[i, j] != cell_ids[i - 1, j]
                or cell_ids[i, j] != cell_ids[i + 1, j]
                or cell_ids[i, j] != cell_ids[i, j - 1]
                or cell_ids[i, j] != cell_ids[i, j + 1]
            ):
                draw_line(
                    edge_layer,
                    (j, i),
                    (j, i),
                    config.edge_width,
                    np.array(config.edge_color, dtype=np.uint8),
                )

    image = canvas.composite_layers(["main", "edges"])
    if config.bloom_intensity > 0:
        image = apply_bloom(image, intensity=config.bloom_intensity)
    if config.vignette_strength > 0:
        image = apply_vignette(image, config.vignette_strength)

    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="voronoi_stained_glass",
        config=config,
    )


def param_space():
    """Define parameter space."""
    from numbrane_python.paramspace import ParamSpace, FloatParam, IntParam, ColorParam

    return ParamSpace(
        params=[
            FloatParam("voronoi_scale", 0.005, 0.1, 0.02, description="Voronoi cell scale"),
            IntParam("num_points", 20, 200, 50, description="Number of Voronoi points"),
            FloatParam("edge_width", 0.5, 5.0, 2.0, description="Edge line width"),
            ColorParam("palette", "void", description="Color palette"),
            FloatParam("noise_scale", 0.001, 0.05, 0.01, description="Noise scale"),
            FloatParam("warp_strength", 0.0, 0.5, 0.2, description="Domain warp strength"),
            FloatParam("bloom_intensity", 0.0, 0.8, 0.3, description="Bloom intensity"),
        ],
    )


def presets() -> dict:
    """Return curated presets."""
    return {
        "dense": {"num_points": 150, "voronoi_scale": 0.01, "bloom_intensity": 0.08},
        "sparse": {"num_points": 30, "voronoi_scale": 0.05, "bloom_intensity": 0.1},
        "colorful": {"palette": "sunset", "bloom_intensity": 0.15},
        "technical": {
            "palette": "high-contrast",
            "bloom_intensity": 0.0,
            "edge_width": 1.5,
            "num_points": 80,
        },
    }
