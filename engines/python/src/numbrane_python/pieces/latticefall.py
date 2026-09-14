"""LATTICEFALL — Python mathematical world builder.

Owns initial topology, field contract summary, and phase composition from a NAP
recipe. Live particle simulation is Rust/WASM; this module is the offline /
cross-language contract source of truth for the initial world JSON.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np

from numbrane_python.fields.compose import AddVectorField
from numbrane_python.fields.vector import CurlNoiseField, VectorField
from numbrane_python.geometry.lattice import (
    flower_of_life_centers,
    geometry_ir_from_centers,
    metatron_lines,
)
from numbrane_python.seed_streams import derive_streams

PIECE_ID = "flagship/latticefall"
PHASE_NAMES = ("ORDER", "DRIFT", "FRACTURE", "FALL", "AFTERIMAGE")
DEFAULT_PHASE_TIMING = [0.15, 0.25, 0.25, 0.20, 0.15]


def _params(recipe: dict[str, Any]) -> dict[str, Any]:
    return dict(recipe.get("parameters") or {})


def _get(params: dict[str, Any], key: str, default: Any) -> Any:
    """Read dotted key, then nested path, else default."""
    if key in params:
        return params[key]
    cur: Any = params
    for part in key.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return default
        cur = cur[part]
    return cur


def _as_float(params: dict[str, Any], key: str, default: float) -> float:
    return float(_get(params, key, default))


def _as_int(params: dict[str, Any], key: str, default: int) -> int:
    return int(_get(params, key, default))


def _as_str(params: dict[str, Any], key: str, default: str) -> str:
    return str(_get(params, key, default))


def _rotate(points: list[tuple[float, float]], deg: float) -> list[tuple[float, float]]:
    if abs(deg) < 1e-12:
        return list(points)
    rad = math.radians(deg)
    c, s = math.cos(rad), math.sin(rad)
    return [(x * c - y * s, x * s + y * c) for x, y in points]


def _ring_index(x: float, y: float, radius: float) -> int:
    if radius <= 0:
        return 0
    return int(round(math.hypot(x, y) / radius))


def _node_id(i: int) -> str:
    return f"n-{i:04d}"


def _edge_ids(
    centers: list[tuple[float, float]],
    id_of: dict[tuple[float, float], str],
    policy: str,
    radius: float,
) -> list[list[str]]:
    policy = policy.lower()
    if policy in {"none", "off", "false"}:
        return []
    if policy in {"ring", "neighbors"}:
        by_ring: dict[int, list[tuple[float, float]]] = {}
        for p in centers:
            by_ring.setdefault(_ring_index(p[0], p[1], radius), []).append(p)
        edges: list[list[str]] = []
        for pts in by_ring.values():
            if len(pts) < 2:
                continue
            ordered = sorted(pts, key=lambda q: math.atan2(q[1], q[0]))
            for i, p in enumerate(ordered):
                q = ordered[(i + 1) % len(ordered)]
                a, b = id_of[p], id_of[q]
                edges.append([a, b] if a < b else [b, a])
        return [list(t) for t in sorted({tuple(e) for e in edges})]
    # Default: Metatron complete graph
    edges = []
    for i, p1 in enumerate(centers):
        for j, p2 in enumerate(centers):
            if j <= i:
                continue
            a, b = id_of[p1], id_of[p2]
            edges.append([a, b] if a < b else [b, a])
    return edges


class _NearestLatticeAttractor(VectorField):
    """Attract each sample toward its nearest lattice node."""

    def __init__(self, points: np.ndarray, strength: float = 1.0) -> None:
        self.points = np.asarray(points, dtype=float).reshape(-1, 2)
        self.strength = float(strength)

    def sample(self, x: np.ndarray, y: np.ndarray, t: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
        _ = t
        x_arr = np.asarray(x, dtype=float)
        y_arr = np.asarray(y, dtype=float)
        scalar = x_arr.ndim == 0 and y_arr.ndim == 0
        if self.points.size == 0:
            z = np.zeros_like(x_arr, dtype=float)
            return z, z

        xf = np.atleast_1d(x_arr).reshape(-1)
        yf = np.atleast_1d(y_arr).reshape(-1)
        # (M, 1, 2) vs (1, N, 2)
        pos = np.stack([xf, yf], axis=-1)[:, None, :]
        pts = self.points[None, :, :]
        d = pts - pos
        dist = np.sqrt(np.sum(d * d, axis=-1) + 1e-12)
        nearest = np.argmin(dist, axis=-1)
        chosen = self.points[nearest]
        dx = chosen[:, 0] - xf
        dy = chosen[:, 1] - yf
        dist_n = np.sqrt(dx * dx + dy * dy + 1e-12)
        force = self.strength / (dist_n + 1e-6)
        vx = (dx / dist_n) * force
        vy = (dy / dist_n) * force
        if scalar:
            return float(vx[0]), float(vy[0])  # type: ignore[return-value]
        return vx.reshape(x_arr.shape), vy.reshape(y_arr.shape)


def _as_scalar(v: float | np.ndarray) -> float:
    return float(np.asarray(v).reshape(-1)[0])


def _field_summary(
    centers: list[tuple[float, float]],
    *,
    scale: float,
    strength: float,
    warp: float,
    octaves: int,
    lattice_attraction: float,
    field_seed: int,
    grid: int = 16,
) -> dict[str, float]:
    """Sample curl + nearest-node attractor on a grid in ``[-2, 2]^2``.

    Samples pointwise: ``CurlNoiseField`` / fBm currently mis-broadcast on
    multi-point arrays; scalar / length-1 samples are the stable contract path.
    """
    curl = CurlNoiseField(
        scale=scale,
        strength=strength,
        octaves=max(1, octaves),
        seed=field_seed & 0xFFFFFFFF,
    )
    attract = _NearestLatticeAttractor(
        np.asarray(centers, dtype=float),
        strength=lattice_attraction,
    )
    field = AddVectorField(curl, attract)

    xs = np.linspace(-2.0, 2.0, grid)
    ys = np.linspace(-2.0, 2.0, grid)
    mags: list[float] = []
    for y in ys:
        for x in xs:
            sx, sy = float(x), float(y)
            if abs(warp) > 1e-12:
                wx, wy = curl.sample(sx, sy)
                sx = sx + _as_scalar(wx) * warp
                sy = sy + _as_scalar(wy) * warp
            vx, vy = field.sample(sx, sy)
            mags.append(math.hypot(_as_scalar(vx), _as_scalar(vy)))
    arr = np.asarray(mags, dtype=float)
    return {
        "mean_mag": float(np.mean(arr)),
        "max_mag": float(np.max(arr)),
    }


def _phase_timing(params: dict[str, Any]) -> list[float]:
    raw = _get(params, "composition.phase_timing", None)
    if raw is None:
        return list(DEFAULT_PHASE_TIMING)
    vals = [float(x) for x in raw]
    if len(vals) != len(PHASE_NAMES):
        raise ValueError(
            f"composition.phase_timing must have {len(PHASE_NAMES)} fractions "
            f"(ORDER,DRIFT,FRACTURE,FALL,AFTERIMAGE); got {len(vals)}"
        )
    return vals


def build_world(recipe: dict[str, Any]) -> dict[str, Any]:
    """Build the initial LATTICEFALL mathematical world (JSON-serializable)."""
    params = _params(recipe)
    seed = int(recipe.get("seed", 0)) & 0xFFFFFFFF
    streams = derive_streams(seed)

    radius = _as_float(params, "geometry.radius", 1.0)
    rings = _as_int(params, "geometry.rings", 2)
    rotation_deg = _as_float(
        params,
        "geometry.rotation_deg",
        _as_float(params, "geometry.rotation", 0.0),
    )
    connection_policy = _as_str(params, "geometry.connection_policy", "metatron")

    levels = max(1, rings)
    centers = _rotate(flower_of_life_centers(radius, levels=levels), rotation_deg)

    nodes: list[dict[str, Any]] = []
    id_of: dict[tuple[float, float], str] = {}
    for i, (x, y) in enumerate(centers):
        nid = _node_id(i)
        id_of[(x, y)] = nid
        nodes.append(
            {
                "id": nid,
                "x": float(x),
                "y": float(y),
                "ring": _ring_index(x, y, radius),
            }
        )

    edge_ids = _edge_ids(centers, id_of, connection_policy, radius)
    # Geometry IR edges as coordinate pairs for drawing
    if connection_policy.lower() in {"none", "off", "false"}:
        ir_edges = None
    elif connection_policy.lower() in {"ring", "neighbors"}:
        ir_edges = []
        id_to_xy = {n["id"]: (n["x"], n["y"]) for n in nodes}
        for a, b in edge_ids:
            ir_edges.append((id_to_xy[a], id_to_xy[b]))
    else:
        ir_edges = metatron_lines(centers)

    ir = geometry_ir_from_centers(centers, radius, edges=ir_edges)

    field_scale = _as_float(params, "field.scale", 0.55)
    field_strength = _as_float(params, "field.strength", 1.0)
    field_warp = _as_float(params, "field.warp", 0.15)
    field_octaves = _as_int(params, "field.octaves", 4)
    lattice_attraction = _as_float(params, "particles.lattice_attraction", 0.85)

    summary = _field_summary(
        centers,
        scale=field_scale,
        strength=field_strength,
        warp=field_warp,
        octaves=field_octaves,
        lattice_attraction=lattice_attraction,
        field_seed=streams["field"],
    )

    time_block = recipe.get("time") or {}
    fps = int(time_block.get("fps", _as_int(params, "fps", 60)))
    duration_frames = int(
        recipe.get("duration_frames")
        or _get(params, "duration_frames", None)
        or time_block.get("duration_frames")
        or fps * _as_int(params, "duration_seconds", 48)
    )

    return {
        "protocol_version": str(recipe.get("protocol_version", "0.1.0")),
        "piece_id": str(recipe.get("piece_id", PIECE_ID)),
        "seed": seed,
        "streams": streams,
        "geometry": {
            "nodes": nodes,
            "edges": edge_ids,
            "ir": ir,
            "radius": radius,
            "rings": rings,
            "rotation_deg": rotation_deg,
            "connection_policy": connection_policy,
        },
        "field": {
            "scale": field_scale,
            "strength": field_strength,
            "warp": field_warp,
            "octaves": field_octaves,
            "summary": summary,
        },
        "particles": {
            "count": _as_int(params, "particles.count", 1200),
            "speed": _as_float(params, "particles.speed", 0.45),
            "drag": _as_float(params, "particles.drag", 0.04),
            "life": _as_float(params, "particles.life", 4.0),
            "lattice_attraction": lattice_attraction,
            "escape_force": _as_float(params, "particles.escape_force", 0.35),
        },
        "fractal": {
            "mode": _as_str(params, "fractal.mode", "julia"),
            "power": _as_float(params, "fractal.power", 2.0),
            "zoom": _as_float(params, "fractal.zoom", 1.15),
            "chaos": _as_float(params, "fractal.chaos", 0.28),
        },
        "color": {
            "palette": _as_str(params, "color.palette", "lattice-ember"),
            "exposure": _as_float(params, "color.exposure", 1.15),
            "saturation": _as_float(params, "color.saturation", 0.85),
        },
        "audio": {
            "bpm": _as_float(params, "audio.bpm", 92.0),
            "scale": _as_str(params, "audio.scale", "dorian"),
            "density": _as_float(params, "audio.density", 0.55),
            "reverb": _as_float(params, "audio.reverb", 0.4),
            "delay": _as_float(params, "audio.delay", 0.22),
        },
        "interaction": {
            "strength": _as_float(params, "interaction.strength", 0.65),
            "radius": _as_float(params, "interaction.radius", 0.45),
        },
        "composition": {
            "phases": list(PHASE_NAMES),
            "phase_timing": _phase_timing(params),
        },
        "fps": fps,
        "duration_frames": duration_frames,
    }
