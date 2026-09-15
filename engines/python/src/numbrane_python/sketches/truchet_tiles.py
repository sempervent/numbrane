"""Truchet tiles sketch with macro composition domains."""

from __future__ import annotations

import hashlib

import numpy as np
from pydantic import BaseModel, Field
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult
from numbrane_python.fields.scalar import NoiseField
from numbrane_python.render.canvas import Canvas
from numbrane_python.render.draw import draw_polyline, draw_line
from numbrane_python.render.palettes import get_palette
from numbrane_python.render.postfx import apply_vignette

# Macro layouts steer tile orientation / scale / voids — still Truchet construction.
MACRO_COMPOSITIONS = (
    "uniform",
    "bands",
    "vortices",
    "radial",
    "masked-void",
    "nested",
    "gradient-scale",
    "flow-directed",
)


class TruchetTilesConfig(BaseModel):
    """Configuration for Truchet tiles sketch."""

    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # Tile parameters (algorithm)
    tile_size: int = Field(default=40, description="Tile size in pixels")
    tile_set: str = Field(default="curves", description="Tile set (curves, arcs, maze)")
    perturbation: float = Field(default=0.1, description="Perturbation strength")

    # Composition — tile layout / orientation
    tile_scale: float = Field(
        default=1.0, ge=0.5, le=2.5, description="Global tile scale multiplier"
    )
    orientation_bias: float = Field(
        default=0.0,
        ge=-1.0,
        le=1.0,
        description="Bias toward alternating orientations",
    )
    field_driven_orientation: bool = Field(
        default=False,
        description="Let scalar field steer tile pattern choice",
    )
    pattern_continuity: float = Field(
        default=0.75,
        ge=0.0,
        le=1.0,
        description="Neighbor-aware edge continuity (1 = strong)",
    )
    macro_composition: str = Field(
        default="uniform",
        description=(
            "uniform|bands|vortices|radial|masked-void|nested|"
            "gradient-scale|flow-directed"
        ),
    )

    # Stylization / style
    line_width: float = Field(default=2.0, description="Line width")
    palette: str = Field(default="ink", description="Color palette")
    background_color: tuple = Field(default=(0, 0, 0), description="Background color (legacy)")
    background: str = Field(default="", description="Intentional background token")
    pfl_style: str = Field(default="", description="PFL art-direction preset id")

    # Noise for perturbation (algorithm)
    noise_scale: float = Field(default=0.1, description="Noise scale for perturbation")


def _domain_fields(
    num_x: int,
    num_y: int,
    *,
    width: int,
    height: int,
    tile_size: int,
    macro: str,
    seed: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return (bias HxW float, active mask HxW bool, local_scale HxW float).

    bias steers Truchet orientation; active gates drawing; local_scale multiplies tile size.
    """
    yy, xx = np.mgrid[0:num_y, 0:num_x]
    cx = (num_x - 1) * 0.5
    cy = (num_y - 1) * 0.5
    nx = (xx - cx) / max(cx, 1.0)
    ny = (yy - cy) / max(cy, 1.0)
    r = np.sqrt(nx * nx + ny * ny)
    ang = np.arctan2(ny, nx)
    rng = np.random.default_rng(seed & 0xFFFFFFFF)
    noise = rng.random((num_y, num_x))
    active = np.ones((num_y, num_x), dtype=bool)
    scale = np.ones((num_y, num_x), dtype=np.float32)
    bias = np.zeros((num_y, num_x), dtype=np.float32)

    if macro == "bands":
        period = 3.0 + (seed % 4)
        bias = np.sin(ny * period * np.pi + seed * 0.01).astype(np.float32)
    elif macro == "vortices":
        # Angular swirl domains → orientation follows vortex phase
        bias = np.sin(ang * 3.0 + r * 4.0 + seed * 0.02).astype(np.float32)
    elif macro == "radial":
        bias = np.sin(r * 6.0 + seed * 0.03).astype(np.float32)
        # Soft annular domains
        ring = ((r > 0.25) & (r < 0.95)).astype(np.float32)
        bias = (bias * 0.7 + (ring * 2.0 - 1.0) * 0.3).astype(np.float32)
    elif macro == "masked-void":
        from numbrane_python.composition.grammar import composition_mask

        m = composition_mask(width, height, "central-void", seed=seed)
        if m is None:
            m = np.ones((height, width), dtype=np.float32)
        # Sample mask at tile centers
        for ty in range(num_y):
            for tx in range(num_x):
                px = min(width - 1, int((tx + 0.5) * tile_size))
                py = min(height - 1, int((ty + 0.5) * tile_size))
                if m[py, px] < 0.5:
                    active[ty, tx] = False
        bias = (noise * 2.0 - 1.0).astype(np.float32)
    elif macro == "nested":
        # Inner fine region, outer coarse — scale halves inside circle
        inner = r < 0.42
        scale = np.where(inner, 0.5, 1.0).astype(np.float32)
        bias = np.where(inner, np.sin(ang * 4.0), np.cos(nx * 3.0)).astype(np.float32)
    elif macro == "gradient-scale":
        # Continuous radial scale control (still discrete Truchet tiles)
        t = np.clip(r / 1.1, 0.0, 1.0)
        scale = (0.55 + 0.9 * t).astype(np.float32)
        bias = (1.0 - 2.0 * t).astype(np.float32)
    elif macro == "flow-directed":
        # Flow orientation plus large-scale domains: density bands + soft voids + scale gradient.
        flow = NoiseField(scale=0.08, seed=seed + 91)
        xs = ((xx + 0.5) * tile_size / max(width, 1)).astype(np.float64).ravel()
        ys = ((yy + 0.5) * tile_size / max(height, 1)).astype(np.float64).ravel()
        samples = flow.sample(xs, ys).reshape(num_y, num_x)
        bias = samples.astype(np.float32)
        # Macro occupancy: carve soft voids where secondary field is low
        dens = NoiseField(scale=0.045, seed=seed + 203)
        dens_s = dens.sample(xs, ys).reshape(num_y, num_x)
        active = dens_s > (-0.15 + (seed % 5) * 0.02)
        # Sparse vs dense regions via local scale
        scale = (0.65 + 0.7 * np.clip((dens_s + 1.0) * 0.5, 0.0, 1.0)).astype(np.float32)
        # Mild band modulation so paths read as image-scale structure, not wallpaper
        bias = (bias * 0.75 + np.sin(nx * (2.5 + seed % 3) + ny * 1.2) * 0.35).astype(np.float32)
    else:
        # uniform
        bias = (noise * 2.0 - 1.0).astype(np.float32) * 0.15

    return bias, active, scale


def _choose_orientation(
    preferred: int,
    left: int | None,
    above: int | None,
    continuity: float,
    rng: np.random.Generator,
) -> int:
    """Binary Truchet orientation {0,1} with neighbor edge continuity.

    Orientation 0 / 1 are the two classic arc tiles that match mid-edge to mid-edge
    when adjacent tiles agree on the shared edge connection.
    """
    # Candidate that best matches left/above: for arcs, matching means same or
    # flipped depending on parity — classic rule: prefer equality for continuity.
    votes: list[int] = []
    if left is not None:
        votes.append(left)
    if above is not None:
        votes.append(above)
    if not votes or continuity <= 0:
        return preferred % 2

    # Majority of neighbors; break ties with preferred
    agree = sum(1 for v in votes if v % 2 == preferred % 2)
    disagree = len(votes) - agree
    if agree >= disagree:
        chosen = preferred % 2
    else:
        chosen = votes[0] % 2

    if continuity < 1.0 and rng.random() > continuity:
        return preferred % 2
    return chosen


def build_orientation_grid(
    config: TruchetTilesConfig,
    *,
    width: int,
    height: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, int]:
    """Build orientation / active / scale grids. Returns (orient, active, scale, tile_size)."""
    base_tile = max(12, int(config.tile_size + (int(config.seed) % 17) - 8))
    tile_size = max(8, int(base_tile * config.tile_scale))
    num_x = width // tile_size + 1
    num_y = height // tile_size + 1
    macro = (config.macro_composition or "uniform").strip().lower()
    if macro not in MACRO_COMPOSITIONS:
        macro = "uniform"

    bias, active, scale = _domain_fields(
        num_x,
        num_y,
        width=width,
        height=height,
        tile_size=tile_size,
        macro=macro,
        seed=int(config.seed),
    )

    orient_field = NoiseField(scale=config.noise_scale * 0.7, seed=int(config.seed) + 17)
    rng = np.random.default_rng(int(config.seed) & 0xFFFFFFFF)
    orient = np.zeros((num_y, num_x), dtype=np.int8)

    for ty in range(num_y):
        for tx in range(num_x):
            if config.field_driven_orientation or macro == "flow-directed":
                field_val = orient_field.sample(
                    np.array([(tx + 0.5) * tile_size / max(width, 1)]),
                    np.array([(ty + 0.5) * tile_size / max(height, 1)]),
                )[0]
                preferred = 1 if (field_val + bias[ty, tx]) > 0 else 0
            else:
                preferred = 1 if bias[ty, tx] > 0 else 0
                if abs(bias[ty, tx]) < 0.08:
                    preferred = int(rng.integers(0, 2))

            if config.orientation_bias != 0.0:
                alt = (tx + ty) % 2
                if config.orientation_bias > 0:
                    preferred = alt
                else:
                    preferred = 1 - alt

            left = int(orient[ty, tx - 1]) if tx > 0 and active[ty, tx - 1] else None
            above = int(orient[ty - 1, tx]) if ty > 0 and active[ty - 1, tx] else None
            orient[ty, tx] = _choose_orientation(
                preferred, left, above, float(config.pattern_continuity), rng
            )

    return orient, active, scale, tile_size


def grid_digest(orient: np.ndarray, active: np.ndarray) -> str:
    """Stable digest of macro structure for tests."""
    payload = np.stack([orient.astype(np.int16), active.astype(np.int16)], axis=0).tobytes()
    return hashlib.sha256(payload).hexdigest()[:16]


def occupied_region_count(active: np.ndarray) -> int:
    """Count active tiles (macro occupancy)."""
    return int(np.sum(active))


def _draw_arc_tile(
    layer: np.ndarray,
    tile_x: float,
    tile_y: float,
    tile_size: float,
    orientation: int,
    line_width: float,
    color: np.ndarray,
    tile_set: str,
) -> None:
    """Draw one Truchet cell. orientation in {0,1}; maze adds diagonals."""
    center_x = tile_x + tile_size / 2
    center_y = tile_y + tile_size / 2
    half = tile_size / 2

    if tile_set == "maze":
        if orientation % 2 == 0:
            draw_line(
                layer,
                (tile_x, tile_y),
                (tile_x + tile_size, tile_y + tile_size),
                line_width,
                color,
            )
        else:
            draw_line(
                layer,
                (tile_x + tile_size, tile_y),
                (tile_x, tile_y + tile_size),
                line_width,
                color,
            )
        return

    # curves / arcs — two complementary quarter-circle pairs (edge-continuous)
    if orientation % 2 == 0:
        # NW + SE arcs
        points_a = []
        points_b = []
        for i in range(20):
            t = i / 19.0
            a0 = t * np.pi / 2
            points_a.append(
                [center_x - half + half * np.cos(a0), center_y - half + half * np.sin(a0)]
            )
            a1 = np.pi + t * np.pi / 2
            points_b.append(
                [center_x + half + half * np.cos(a1), center_y + half + half * np.sin(a1)]
            )
        draw_polyline(layer, np.array(points_a), line_width, color)
        draw_polyline(layer, np.array(points_b), line_width, color)
    else:
        # NE + SW arcs
        points_a = []
        points_b = []
        for i in range(20):
            t = i / 19.0
            a0 = np.pi / 2 + t * np.pi / 2
            points_a.append(
                [center_x + half + half * np.cos(a0), center_y - half + half * np.sin(a0)]
            )
            a1 = -np.pi / 2 + t * np.pi / 2
            points_b.append(
                [center_x - half + half * np.cos(a1), center_y + half + half * np.sin(a1)]
            )
        draw_polyline(layer, np.array(points_a), line_width, color)
        draw_polyline(layer, np.array(points_b), line_width, color)


def render_truchet_tile(
    layer: np.ndarray,
    tile_x: float,
    tile_y: float,
    tile_size: float,
    orientation: int,
    line_width: float,
    color: np.ndarray,
    tile_set: str = "curves",
) -> None:
    """Public single-tile helper (mashups / tests)."""
    _draw_arc_tile(layer, tile_x, tile_y, tile_size, orientation, line_width, color, tile_set)


def render(config: TruchetTilesConfig, ctx: RenderContext) -> RenderResult:
    """Render Truchet tiles."""
    from numbrane_python.composition.grammar import background_rgb
    from numbrane_python.style.pfl import apply_style_to_params

    if config.pfl_style:
        raw = apply_style_to_params(config.pfl_style, config.model_dump())
        config = config.model_copy(
            update={k: raw[k] for k in ("palette", "background") if k in raw}
        )

    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    if config.background:
        layer[:] = np.array(background_rgb(config.background), dtype=np.uint8)
    else:
        layer[:] = np.array(config.background_color, dtype=np.uint8)

    noise_field = NoiseField(scale=config.noise_scale, seed=ctx.rng.seed)
    palette_colors = get_palette(config.palette)
    fg = palette_colors[-1] if len(palette_colors) > 1 else (220, 220, 230)
    color = np.array(fg, dtype=np.uint8)

    orient, active, scale, tile_size = build_orientation_grid(
        config, width=ctx.width, height=ctx.height
    )
    num_y, num_x = orient.shape
    macro = (config.macro_composition or "uniform").strip().lower()

    # Nested / gradient-scale: redraw fine tiles inside scaled regions on a half grid.
    for ty in range(num_y):
        for tx in range(num_x):
            if not active[ty, tx]:
                continue
            local_scale = float(scale[ty, tx])
            # Subdivide when local scale asks for finer Truchet cells
            if macro in {"nested", "gradient-scale"} and local_scale < 0.75:
                sub = max(6, tile_size // 2)
                for sy in range(2):
                    for sx in range(2):
                        sub_x = tx * tile_size + sx * sub
                        sub_y = ty * tile_size + sy * sub
                        # Inherit parent orientation with checker for continuity
                        o = int(orient[ty, tx]) ^ ((sx + sy) % 2)
                        _draw_arc_tile(
                            layer,
                            float(sub_x),
                            float(sub_y),
                            float(sub),
                            o,
                            config.line_width * 0.85,
                            color,
                            config.tile_set,
                        )
                continue

            tile_x = float(tx * tile_size)
            tile_y = float(ty * tile_size)
            if config.perturbation > 0:
                perturb_x = (
                    noise_field.sample(
                        np.array([tile_x / max(ctx.width, 1)]),
                        np.array([tile_y / max(ctx.height, 1)]),
                    )[0]
                    * config.perturbation
                    * tile_size
                )
                perturb_y = (
                    noise_field.sample(
                        np.array([(tile_x + 17) / max(ctx.width, 1)]),
                        np.array([(tile_y + 31) / max(ctx.height, 1)]),
                    )[0]
                    * config.perturbation
                    * tile_size
                )
                tile_x += perturb_x
                tile_y += perturb_y

            _draw_arc_tile(
                layer,
                tile_x,
                tile_y,
                float(tile_size),
                int(orient[ty, tx]),
                config.line_width,
                color,
                config.tile_set,
            )

    image = canvas.get_image()
    image = apply_vignette(image, 0.2)

    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="truchet_tiles",
        config=config,
    )


def get_schema():
    """Get parameter schema."""
    from numbrane_python.params.schema import ParamSchema
    from numbrane_python.params.types import (
        IntParam,
        FloatParam,
        ChoiceParam,
        ColorParam,
    )

    return ParamSchema(
        name="truchet_tiles",
        description="Truchet tiles with perturbation",
        params=[
            IntParam("tile_size", 10, 200, 40, path="geom.tile_size"),
            ChoiceParam(
                "tile_set", ["curves", "arcs", "maze"], default="curves", path="geom.tile_set"
            ),
            ChoiceParam(
                "macro_composition",
                list(MACRO_COMPOSITIONS),
                default="uniform",
                path="composition.macro_composition",
            ),
            FloatParam("perturbation", 0.0, 0.5, 0.1, path="composition.perturbation"),
            FloatParam("line_width", 0.5, 10.0, 2.0, path="stroke.width"),
            ColorParam("palette", "void", path="color.palette"),
            FloatParam("noise_scale", 0.01, 1.0, 0.1, path="field.scale"),
        ],
    )


def defaults() -> dict:
    """Get default values."""
    config = TruchetTilesConfig()
    return config.model_dump()


def presets() -> dict:
    """Return curated presets."""
    return {
        "dense_maze": {
            "tile_size": 20,
            "tile_set": "maze",
            "perturbation": 0.05,
            "pattern_continuity": 0.9,
            "macro_composition": "bands",
        },
        "flowing_curves": {
            "tile_size": 60,
            "tile_set": "curves",
            "perturbation": 0.15,
            "line_width": 3.0,
            "field_driven_orientation": True,
            "macro_composition": "flow-directed",
            "pattern_continuity": 0.85,
        },
        "radial_void": {
            "tile_size": 36,
            "tile_set": "arcs",
            "macro_composition": "masked-void",
            "pattern_continuity": 0.8,
        },
        "nested_vortex": {
            "tile_size": 48,
            "tile_set": "curves",
            "macro_composition": "vortices",
            "pattern_continuity": 0.9,
        },
    }
