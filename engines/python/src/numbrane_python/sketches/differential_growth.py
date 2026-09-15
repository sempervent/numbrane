"""Differential growth / venation sketch."""

import numpy as np
from pydantic import BaseModel, Field
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult
from numbrane_python.render.canvas import Canvas
from numbrane_python.render.draw import draw_polyline
from numbrane_python.render.palettes import get_palette
from numbrane_python.render.postfx import apply_vignette, apply_bloom


def _initial_segments(
    config: "DifferentialGrowthConfig",
    ctx: RenderContext,
    rng: np.random.Generator,
) -> list[dict]:
    """Build starting topology — composition layout, growth math unchanged."""
    w, h = ctx.width, ctx.height
    cx, cy = w * 0.5, h * 0.5
    topo = config.initial_topology
    segments: list[dict] = []

    def _seg(start, end, thickness=None):
        segments.append(
            {
                "start": list(start),
                "end": list(end),
                "thickness": thickness or config.vein_thickness,
                "age": 0,
            }
        )

    if topo == "ring":
        n = max(8, config.num_seeds * 3)
        radius = min(w, h) * (0.22 + (config.seed % 5) * 0.015)
        for i in range(n):
            a0 = (i / n) * 2 * np.pi
            a1 = ((i + 1) / n) * 2 * np.pi
            p0 = [cx + np.cos(a0) * radius, cy + np.sin(a0) * radius]
            p1 = [cx + np.cos(a1) * radius, cy + np.sin(a1) * radius]
            _seg(p0, p1)
    elif topo == "open-curve":
        n = max(3, config.num_seeds)
        pts = []
        for i in range(n):
            t = i / max(n - 1, 1)
            pts.append([w * (0.15 + 0.7 * t), h * (0.35 + 0.3 * np.sin(t * np.pi * 2))])
        for i in range(len(pts) - 1):
            _seg(pts[i], pts[i + 1])
    elif topo == "islands":
        for _ in range(config.num_seeds):
            sx = rng.uniform(w * 0.2, w * 0.8)
            sy = rng.uniform(h * 0.2, h * 0.8)
            angle = rng.uniform(0, 2 * np.pi)
            length = rng.uniform(12, 28)
            _seg([sx, sy], [sx + np.cos(angle) * length, sy + np.sin(angle) * length])
    elif topo == "geometry":
        from numbrane_python.composition.grammar import composition_mask

        mask = composition_mask(w, h, "ring", seed=int(config.seed))
        if mask is not None:
            ys, xs = np.where(mask > 0.5)
            if len(xs) > 0:
                idx = rng.choice(len(xs), size=min(config.num_seeds, len(xs)), replace=False)
                for ix, iy in zip(xs[idx], ys[idx], strict=False):
                    angle = rng.uniform(0, 2 * np.pi)
                    length = rng.uniform(10, 24)
                    _seg(
                        [float(ix), float(iy)],
                        [ix + np.cos(angle) * length, iy + np.sin(angle) * length],
                    )
        if not segments:
            topo = "islands"
            return _initial_segments(
                config.model_copy(update={"initial_topology": "islands"}), ctx, rng
            )
    else:
        for _ in range(config.num_seeds):
            seed = [rng.uniform(0, w), rng.uniform(0, h)]
            angle = rng.uniform(0, 2 * np.pi)
            length = rng.uniform(10, 30)
            _seg(seed, [seed[0] + np.cos(angle) * length, seed[1] + np.sin(angle) * length])

    return segments


class DifferentialGrowthConfig(BaseModel):
    """Configuration for differential growth sketch."""

    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # Growth parameters (algorithm)
    num_seeds: int = Field(default=5, description="Number of seed points")
    growth_rate: float = Field(default=0.5, description="Growth rate per step")
    branch_angle: float = Field(default=45.0, description="Branching angle (degrees)")
    branch_prob: float = Field(default=0.02, description="Branching probability")
    max_length: float = Field(default=500.0, description="Maximum segment length")

    # Venation parameters (algorithm)
    vein_thickness: float = Field(default=2.0, description="Base vein thickness")
    thickness_variation: float = Field(default=0.5, description="Thickness variation")
    nutrient_diffusion: float = Field(default=0.1, description="Nutrient diffusion rate")

    # Composition — topology and framing
    initial_topology: str = Field(
        default="islands",
        description="ring|open-curve|islands|geometry",
    )
    framing: str = Field(default="fit", description="fit | center | fixed")
    margin: float = Field(default=1.2, description="Framing margin multiplier")
    line_hierarchy: float = Field(
        default=0.82,
        description="Child branch thickness scale vs parent",
    )

    # Rendering / style
    palette: str = Field(default="void", description="Color palette")
    stroke_width: float = Field(default=1.5, description="Stroke width")
    background_color: tuple = Field(default=(0, 0, 0), description="Background color (legacy)")
    background: str = Field(default="", description="Intentional background token")
    pfl_style: str = Field(default="", description="PFL art-direction preset id")


def render(config: DifferentialGrowthConfig, ctx: RenderContext) -> RenderResult:
    """Render differential growth."""
    from numbrane_python.composition.grammar import background_rgb, framing_transform
    from numbrane_python.style.pfl import apply_style_to_params

    if config.pfl_style:
        raw = apply_style_to_params(config.pfl_style, config.model_dump())
        config = config.model_copy(
            update={k: raw[k] for k in ("palette", "background", "margin") if k in raw}
        )

    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    if config.background:
        layer[:] = np.array(background_rgb(config.background), dtype=np.uint8)
    else:
        layer[:] = np.array(config.background_color, dtype=np.uint8)

    rng = ctx.rng.generator
    segments = _initial_segments(config, ctx, rng)

    max_steps = 500
    palette_colors = get_palette(config.palette)

    for step in range(max_steps):
        new_segments = []
        for seg in segments:
            if seg["age"] > max_steps:
                continue
            dx = seg["end"][0] - seg["start"][0]
            dy = seg["end"][1] - seg["start"][1]
            length = np.sqrt(dx**2 + dy**2)
            if length < config.max_length:
                angle = np.arctan2(dy, dx)
                growth = config.growth_rate * (1.0 - length / config.max_length)
                new_end = [
                    seg["end"][0] + np.cos(angle) * growth,
                    seg["end"][1] + np.sin(angle) * growth,
                ]
                new_end[0] = np.clip(new_end[0], 0, ctx.width)
                new_end[1] = np.clip(new_end[1], 0, ctx.height)
                seg["end"] = new_end
                seg["age"] += 1
                if rng.random() < config.branch_prob and length > 20:
                    branch_angle = angle + np.deg2rad(
                        rng.uniform(-config.branch_angle, config.branch_angle)
                    )
                    branch_length = rng.uniform(5, 15)
                    branch_end = [
                        seg["end"][0] + np.cos(branch_angle) * branch_length,
                        seg["end"][1] + np.sin(branch_angle) * branch_length,
                    ]
                    branch_end[0] = np.clip(branch_end[0], 0, ctx.width)
                    branch_end[1] = np.clip(branch_end[1], 0, ctx.height)
                    new_segments.append(
                        {
                            "start": seg["end"].copy(),
                            "end": branch_end,
                            "thickness": seg["thickness"] * config.line_hierarchy,
                            "age": 0,
                        }
                    )
        segments.extend(new_segments)

    all_x, all_y = [], []
    for seg in segments:
        all_x.extend([seg["start"][0], seg["end"][0]])
        all_y.extend([seg["start"][1], seg["end"][1]])

    xs = np.array(all_x, dtype=np.float64)
    ys = np.array(all_y, dtype=np.float64)
    style_comp = {}
    if config.pfl_style:
        style_comp = apply_style_to_params(config.pfl_style, {}).get("composition") or {}

    px, py = framing_transform(
        xs,
        ys,
        width=ctx.width,
        height=ctx.height,
        framing=config.framing,
        margin=config.margin,
        center_bias=float(style_comp.get("center_bias", 0.5)),
    )

    for i, seg in enumerate(segments):
        thickness_norm = (seg["thickness"] - config.vein_thickness * 0.5) / (
            config.vein_thickness * 2
        )
        color_idx = int(np.clip(thickness_norm * len(palette_colors), 0, len(palette_colors) - 1))
        color = np.array(palette_colors[color_idx], dtype=np.uint8)
        width = seg["thickness"] * (1.0 + config.thickness_variation * rng.uniform(-1, 1))
        j = i * 2
        draw_polyline(
            layer,
            np.array([[px[j], py[j]], [px[j + 1], py[j + 1]]]),
            width,
            color,
            antialias=True,
        )

    image = canvas.get_image()
    image = apply_vignette(image, 0.3)
    image = apply_bloom(image, intensity=0.2)

    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="differential_growth",
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
        name="differential_growth",
        description="Differential growth / venation patterns",
        params=[
            IntParam("num_seeds", 1, 20, 5, path="growth.num_seeds"),
            FloatParam("growth_rate", 0.1, 2.0, 0.5, path="growth.rate"),
            FloatParam("branch_angle", 10.0, 90.0, 45.0, path="growth.branch_angle"),
            FloatParam("branch_prob", 0.0, 0.1, 0.02, path="growth.branch_prob"),
            FloatParam("max_length", 100.0, 1000.0, 500.0, path="growth.max_length"),
            FloatParam("vein_thickness", 0.5, 5.0, 2.0, path="geom.vein_thickness"),
            FloatParam("thickness_variation", 0.0, 1.0, 0.5, path="geom.thickness_variation"),
            ColorParam("palette", "void", path="color.palette"),
        ],
    )


def defaults() -> dict:
    """Get default values."""
    config = DifferentialGrowthConfig()
    return config.model_dump()


def presets() -> dict:
    """Return curated presets."""
    return {
        "dense_web": {
            "num_seeds": 10,
            "growth_rate": 0.8,
            "branch_prob": 0.05,
            "max_length": 300.0,
        },
        "sparse_tendrils": {
            "num_seeds": 3,
            "growth_rate": 0.3,
            "branch_prob": 0.01,
            "max_length": 800.0,
        },
        "void_tendrils": {
            "num_seeds": 5,
            "growth_rate": 0.5,
            "branch_angle": 60.0,
            "palette": "void",
            "vein_thickness": 1.5,
        },
    }
