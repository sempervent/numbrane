"""Differential growth / venation sketch."""

from __future__ import annotations

import numpy as np
from pydantic import BaseModel, Field
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult
from numbrane_python.render.canvas import Canvas
from numbrane_python.render.draw import draw_polyline
from numbrane_python.render.palettes import get_palette
from numbrane_python.render.postfx import apply_vignette, apply_bloom

# Stage → steps / growth / branching / framing tendencies (composition, not new math).
GROWTH_STAGES: dict[str, dict] = {
    "young": {
        "steps": 90,
        "growth_rate": 0.35,
        "branch_prob": 0.008,
        "max_length": 280.0,
        "margin": 1.55,
        "line_hierarchy": 0.72,
        "vein_thickness": 1.6,
        "negative_space": 0.85,
    },
    "developed": {
        "steps": 220,
        "growth_rate": 0.5,
        "branch_prob": 0.02,
        "max_length": 420.0,
        "margin": 1.28,
        "line_hierarchy": 0.82,
        "vein_thickness": 2.0,
        "negative_space": 0.55,
    },
    "dense": {
        "steps": 380,
        "growth_rate": 0.65,
        "branch_prob": 0.045,
        "max_length": 360.0,
        "margin": 1.12,
        "line_hierarchy": 0.88,
        "vein_thickness": 2.2,
        "negative_space": 0.35,
    },
    "overgrown": {
        "steps": 420,
        "growth_rate": 0.8,
        "branch_prob": 0.055,
        "max_length": 480.0,
        "margin": 1.02,
        "line_hierarchy": 0.92,
        "vein_thickness": 2.4,
        "negative_space": 0.18,
    },
}

_MAX_SEGMENTS = 4500
_MAX_TRAIL_SNAPSHOTS = 8


def apply_growth_stage(config: "DifferentialGrowthConfig") -> "DifferentialGrowthConfig":
    """Merge growth_stage tendencies; explicit steps > 0 wins over stage default."""
    name = (config.growth_stage or "").strip().lower()
    if not name or name not in GROWTH_STAGES:
        return config
    stage = dict(GROWTH_STAGES[name])
    if config.steps > 0:
        stage.pop("steps", None)
    # negative_space maps to margin expansion (more space → larger margin)
    neg = float(stage.pop("negative_space", 0.5))
    if "margin" in stage:
        stage["margin"] = float(stage["margin"]) * (0.85 + 0.35 * neg)
    return config.model_copy(update=stage)


def _initial_segments(
    config: "DifferentialGrowthConfig",
    ctx: RenderContext,
    rng: np.random.Generator,
) -> list[dict]:
    """Build starting topology — composition layout, growth math unchanged."""
    w, h = ctx.width, ctx.height
    cx, cy = w * 0.5, h * 0.5
    topo = config.initial_topology
    # Aliases
    if topo == "open-curve":
        topo = "open-arc"
    if topo in {"geometry-derived", "geometry_mask", "sacred"}:
        topo = "geometry"
    segments: list[dict] = []

    def _seg(start, end, thickness=None, generation: int = 0):
        segments.append(
            {
                "start": list(start),
                "end": list(end),
                "thickness": thickness or config.vein_thickness,
                "age": 0,
                "generation": generation,
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
    elif topo == "double-ring":
        n = max(8, config.num_seeds * 2)
        r0 = min(w, h) * (0.16 + (config.seed % 4) * 0.01)
        r1 = min(w, h) * (0.32 + (config.seed % 5) * 0.012)
        for ring_i, radius in enumerate((r0, r1)):
            phase = 0.08 if ring_i == 1 else 0.0
            thick = config.vein_thickness * (1.1 if ring_i == 0 else 0.85)
            for i in range(n):
                a0 = (i / n) * 2 * np.pi + phase
                a1 = ((i + 1) / n) * 2 * np.pi + phase
                p0 = [cx + np.cos(a0) * radius, cy + np.sin(a0) * radius]
                p1 = [cx + np.cos(a1) * radius, cy + np.sin(a1) * radius]
                _seg(p0, p1, thickness=thick)
    elif topo == "open-arc":
        n = max(4, config.num_seeds + 2)
        sweep = np.pi * (0.85 + (config.seed % 5) * 0.05)
        start_a = -sweep * 0.5 + (config.seed % 7) * 0.04
        radius = min(w, h) * (0.28 + (config.seed % 4) * 0.02)
        pts = []
        for i in range(n):
            t = i / max(n - 1, 1)
            a = start_a + t * sweep
            pts.append([cx + np.cos(a) * radius, cy + np.sin(a) * radius * 0.82])
        for i in range(len(pts) - 1):
            _seg(pts[i], pts[i + 1])
    elif topo == "spiral":
        n = max(18, config.num_seeds * 6)
        turns = 2.2 + (config.seed % 4) * 0.2
        r_max = min(w, h) * (0.38 + (config.seed % 5) * 0.015)
        pts = []
        for i in range(n):
            t = i / max(n - 1, 1)
            a = t * turns * 2 * np.pi
            r = r_max * (0.06 + 0.94 * t)
            pts.append([cx + np.cos(a) * r, cy + np.sin(a) * r])
        for i in range(len(pts) - 1):
            _seg(pts[i], pts[i + 1], thickness=config.vein_thickness * (1.15 - 0.4 * i / n))
        # Secondary offset spiral for mass
        pts2 = []
        for i in range(max(10, n // 2)):
            t = i / max(n // 2 - 1, 1)
            a = t * turns * 2 * np.pi + 0.35
            r = r_max * (0.12 + 0.75 * t)
            pts2.append([cx + np.cos(a) * r, cy + np.sin(a) * r])
        for i in range(len(pts2) - 1):
            _seg(pts2[i], pts2[i + 1], thickness=config.vein_thickness * 0.75, generation=1)
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
    steps: int = Field(
        default=0,
        description="Simulation steps; 0 = use growth_stage or legacy default 500",
    )

    # Venation parameters (algorithm)
    vein_thickness: float = Field(default=2.0, description="Base vein thickness")
    thickness_variation: float = Field(default=0.5, description="Thickness variation")
    nutrient_diffusion: float = Field(default=0.1, description="Nutrient diffusion rate")

    # Composition — topology, stage, framing
    initial_topology: str = Field(
        default="islands",
        description="ring|double-ring|open-arc|islands|spiral|geometry",
    )
    growth_stage: str = Field(
        default="developed",
        description="young|developed|dense|overgrown",
    )
    framing: str = Field(default="fit", description="fit | center | fixed")
    margin: float = Field(default=1.2, description="Framing margin multiplier")
    line_hierarchy: float = Field(
        default=0.82,
        description="Child branch thickness scale vs parent",
    )
    historical_trails: bool = Field(
        default=True,
        description="Accumulate faint historical polylines during growth",
    )
    trail_interval: int = Field(
        default=40,
        description="Steps between historical trail snapshots",
    )

    # Rendering / style
    palette: str = Field(default="void", description="Color palette")
    stroke_width: float = Field(default=1.5, description="Stroke width")
    background_color: tuple = Field(default=(0, 0, 0), description="Background color (legacy)")
    background: str = Field(default="", description="Intentional background token")
    pfl_style: str = Field(default="", description="PFL art-direction preset id")


def resolve_steps(config: DifferentialGrowthConfig) -> int:
    """Effective simulation step count after stage merge."""
    if config.steps > 0:
        return int(config.steps)
    stage = (config.growth_stage or "").strip().lower()
    if stage in GROWTH_STAGES:
        return int(GROWTH_STAGES[stage]["steps"])
    return 500


def grow_segments(
    config: DifferentialGrowthConfig,
    ctx: RenderContext,
    rng: np.random.Generator,
) -> tuple[list[dict], list[list[dict]]]:
    """Run differential growth; return final segments and optional trail snapshots."""
    config = apply_growth_stage(config)
    segments = _initial_segments(config, ctx, rng)
    max_steps = resolve_steps(config)
    trails: list[list[dict]] = []
    interval = max(1, int(config.trail_interval))
    # Spread a few trail samples across the run instead of storing every interval forever.
    if config.historical_trails and max_steps > 0:
        interval = max(interval, max(1, max_steps // _MAX_TRAIL_SNAPSHOTS))

    for step in range(max_steps):
        if len(segments) >= _MAX_SEGMENTS:
            break
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
                if (
                    len(segments) + len(new_segments) < _MAX_SEGMENTS
                    and rng.random() < config.branch_prob
                    and length > 20
                ):
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
                    gen = int(seg.get("generation", 0)) + 1
                    new_segments.append(
                        {
                            "start": seg["end"].copy(),
                            "end": branch_end,
                            "thickness": seg["thickness"] * config.line_hierarchy,
                            "age": 0,
                            "generation": gen,
                        }
                    )
        segments.extend(new_segments)
        if (
            config.historical_trails
            and len(trails) < _MAX_TRAIL_SNAPSHOTS
            and (step + 1) % interval == 0
        ):
            # Sparse sample of current structure for ghost trails
            sample = segments[:: max(1, len(segments) // 120)]
            trails.append(
                [
                    {
                        "start": s["start"].copy(),
                        "end": s["end"].copy(),
                        "thickness": s["thickness"] * 0.7,
                        "generation": s.get("generation", 0),
                    }
                    for s in sample
                ]
            )
    return segments, trails


def render(config: DifferentialGrowthConfig, ctx: RenderContext) -> RenderResult:
    """Render differential growth."""
    from numbrane_python.composition.grammar import background_rgb, framing_transform
    from numbrane_python.style.pfl import apply_style_to_params

    config = apply_growth_stage(config)

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
    segments, trails = grow_segments(config, ctx, rng)
    palette_colors = get_palette(config.palette)

    all_x, all_y = [], []
    for seg in segments:
        all_x.extend([seg["start"][0], seg["end"][0]])
        all_y.extend([seg["start"][1], seg["end"][1]])
    for snap in trails:
        for seg in snap:
            all_x.extend([seg["start"][0], seg["end"][0]])
            all_y.extend([seg["start"][1], seg["end"][1]])

    xs = np.array(all_x if all_x else [0.0, 1.0], dtype=np.float64)
    ys = np.array(all_y if all_y else [0.0, 1.0], dtype=np.float64)
    style_comp = {}
    if config.pfl_style:
        style_comp = apply_style_to_params(config.pfl_style, {}).get("composition") or {}

    # Slightly more negative space for young stages via margin already; center_bias softens crop.
    center_bias = float(style_comp.get("center_bias", 0.55))
    stage = (config.growth_stage or "developed").lower()
    if stage == "young":
        center_bias = min(1.0, center_bias + 0.12)
    elif stage == "overgrown":
        center_bias = max(0.0, center_bias - 0.1)

    px, py = framing_transform(
        xs,
        ys,
        width=ctx.width,
        height=ctx.height,
        framing=config.framing,
        margin=config.margin,
        center_bias=center_bias,
    )

    # Map world → framed coords via the same transform used for all points.
    # Rebuild index map: trails first (chronological), then live segments.
    def _draw_seg_list(seg_list: list[dict], start_idx: int, alpha: float) -> int:
        idx = start_idx
        for seg in seg_list:
            gen = int(seg.get("generation", 0))
            # Stroke hierarchy: root thicker / brighter, twigs thinner / quieter.
            thickness_norm = (seg["thickness"] - config.vein_thickness * 0.5) / (
                config.vein_thickness * 2
            )
            color_idx = int(
                np.clip(
                    (thickness_norm * 0.7 + (1.0 - min(gen, 6) / 6.0) * 0.3) * len(palette_colors),
                    0,
                    len(palette_colors) - 1,
                )
            )
            base = np.array(palette_colors[color_idx], dtype=np.float32)
            color = np.clip(base * alpha + (1.0 - alpha) * layer[0, 0].astype(np.float32), 0, 255)
            color = color.astype(np.uint8)
            width = seg["thickness"] * (
                1.0 + config.thickness_variation * rng.uniform(-0.6, 0.6)
            )
            # Hierarchy taper for deep generations
            width *= max(0.35, 1.0 - gen * 0.08) * (0.55 + 0.45 * alpha)
            j = idx * 2
            draw_polyline(
                layer,
                np.array([[px[j], py[j]], [px[j + 1], py[j + 1]]]),
                max(0.4, width),
                color,
                antialias=True,
            )
            idx += 1
        return idx

    cursor = 0
    n_trails = len(trails)
    for ti, snap in enumerate(trails):
        # Older trails fainter → historical accumulation without muddying foreground
        fade = 0.18 + 0.35 * ((ti + 1) / max(n_trails, 1))
        cursor = _draw_seg_list(snap, cursor, fade)
    _draw_seg_list(segments, cursor, 1.0)

    image = canvas.get_image()
    image = apply_vignette(image, 0.28 if stage != "overgrown" else 0.18)
    image = apply_bloom(image, intensity=0.15 if stage == "young" else 0.22)

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
        ChoiceParam,
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
            ChoiceParam(
                "growth_stage",
                ["young", "developed", "dense", "overgrown"],
                default="developed",
                path="composition.growth_stage",
            ),
            ChoiceParam(
                "initial_topology",
                ["ring", "double-ring", "open-arc", "islands", "spiral", "geometry"],
                default="islands",
                path="composition.initial_topology",
            ),
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
            "growth_stage": "dense",
            "initial_topology": "islands",
            "growth_rate": 0.8,
            "branch_prob": 0.05,
            "max_length": 300.0,
        },
        "sparse_tendrils": {
            "num_seeds": 3,
            "growth_stage": "young",
            "initial_topology": "open-arc",
            "growth_rate": 0.3,
            "branch_prob": 0.01,
            "max_length": 800.0,
        },
        "void_tendrils": {
            "num_seeds": 5,
            "growth_stage": "developed",
            "initial_topology": "spiral",
            "growth_rate": 0.5,
            "branch_angle": 60.0,
            "palette": "void",
            "vein_thickness": 1.5,
        },
        "overgrown_rings": {
            "num_seeds": 8,
            "growth_stage": "overgrown",
            "initial_topology": "double-ring",
            "historical_trails": True,
        },
    }
