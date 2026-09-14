"""Build and advance structured piece state for Seed Artifacts."""

from __future__ import annotations

from typing import Any

import numpy as np
from PIL import Image

from numbrane_python.geometry.lattice import (
    flower_of_life_centers,
    geometry_ir_from_centers,
    metatron_lines,
    seed_of_life_centers,
)
from numbrane_python.nap.adapter import recipe_to_render_context
from numbrane_python.pieces.circle_lattice import generate as gen_lattice
from numbrane_python.pieces.latticefall import build_world
from numbrane_python.render.palettes import get_palette, gradient_map


def _rd_step(
    u: np.ndarray,
    v: np.ndarray,
    *,
    f: float,
    k: float,
    du: float,
    dv: float,
    dt: float,
) -> tuple[np.ndarray, np.ndarray]:
    laplacian = np.array(
        [[0.05, 0.2, 0.05], [0.2, -1.0, 0.2], [0.05, 0.2, 0.05]],
        dtype=np.float32,
    )
    u_lap = np.zeros_like(u)
    v_lap = np.zeros_like(v)
    for i in range(-1, 2):
        for j in range(-1, 2):
            u_lap += laplacian[i + 1, j + 1] * np.roll(np.roll(u, i, axis=0), j, axis=1)
            v_lap += laplacian[i + 1, j + 1] * np.roll(np.roll(v, i, axis=0), j, axis=1)
    uv2 = u * v * v
    u_new = u + dt * (du * u_lap - uv2 + f * (1 - u))
    v_new = v + dt * (dv * v_lap + uv2 - (f + k) * v)
    return np.clip(u_new, 0, 1), np.clip(v_new, 0, 1)


def simulate_reaction_diffusion(
    width: int,
    height: int,
    seed: int,
    *,
    iterations: int,
    f: float = 0.055,
    k: float = 0.062,
    du: float = 0.16,
    dv: float = 0.08,
    dt: float = 1.0,
    u0: np.ndarray | None = None,
    v0: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """Run Gray-Scott for ``iterations`` steps; optional warm start from U/V."""
    rng = np.random.default_rng(seed)
    if u0 is None or v0 is None:
        u = np.ones((height, width), dtype=np.float32)
        v = np.zeros((height, width), dtype=np.float32)
        for _ in range(10):
            x = int(rng.integers(0, width))
            y = int(rng.integers(0, height))
            radius = int(rng.integers(5, 20))
            yy, xx = np.ogrid[:height, :width]
            mask = (xx - x) ** 2 + (yy - y) ** 2 < radius**2
            v[mask] = 1.0
    else:
        u = u0.astype(np.float32).copy()
        v = v0.astype(np.float32).copy()
    for _ in range(max(0, iterations)):
        u, v = _rd_step(u, v, f=f, k=k, du=du, dv=dv, dt=dt)
    return u, v


def simulate_slime(
    width: int,
    height: int,
    seed: int,
    *,
    steps: int,
    num_agents: int = 800,
    agents0: np.ndarray | None = None,
    trail0: np.ndarray | None = None,
    sensor_angle: float = 45.0,
    sensor_distance: float = 9.0,
    rotation_angle: float = 45.0,
    step_size: float = 1.0,
    deposit_amount: float = 1.0,
    decay_rate: float = 0.1,
) -> tuple[np.ndarray, np.ndarray]:
    """Return (agents Nx3 [x,y,angle], trail HxW)."""
    rng = np.random.default_rng(seed)
    if trail0 is None:
        trail = np.zeros((height, width), dtype=np.float32)
    else:
        trail = trail0.astype(np.float32).copy()
    if agents0 is None:
        agents = np.column_stack(
            [
                rng.uniform(0, width, size=num_agents),
                rng.uniform(0, height, size=num_agents),
                rng.uniform(0, 2 * np.pi, size=num_agents),
            ]
        ).astype(np.float32)
    else:
        agents = agents0.astype(np.float32).copy()

    sa = np.deg2rad(sensor_angle)
    ra = np.deg2rad(rotation_angle)

    def sample(x: float, y: float) -> float:
        ix = int(np.clip(x, 0, width - 1))
        iy = int(np.clip(y, 0, height - 1))
        return float(trail[iy, ix])

    for _ in range(max(0, steps)):
        for i in range(agents.shape[0]):
            ang = float(agents[i, 2])
            x, y = float(agents[i, 0]), float(agents[i, 1])
            left = sample(
                x + np.cos(ang - sa) * sensor_distance,
                y + np.sin(ang - sa) * sensor_distance,
            )
            center = sample(
                x + np.cos(ang) * sensor_distance,
                y + np.sin(ang) * sensor_distance,
            )
            right = sample(
                x + np.cos(ang + sa) * sensor_distance,
                y + np.sin(ang + sa) * sensor_distance,
            )
            if left > center and left > right:
                ang -= ra
            elif right > center and right > left:
                ang += ra
            x = (x + np.cos(ang) * step_size) % width
            y = (y + np.sin(ang) * step_size) % height
            agents[i, 0], agents[i, 1], agents[i, 2] = x, y, ang
            ix, iy = int(x) % width, int(y) % height
            trail[iy, ix] += deposit_amount
        trail *= 1.0 - decay_rate
        # cheap diffusion
        trail = 0.25 * (
            np.roll(trail, 1, 0)
            + np.roll(trail, -1, 0)
            + np.roll(trail, 1, 1)
            + np.roll(trail, -1, 1)
        )
    return agents, trail


def _preview_from_field(field: np.ndarray, palette: str = "void") -> np.ndarray:
    colors = gradient_map(field, get_palette(palette))
    return colors.astype(np.uint8)


def build_piece_state(
    piece_id: str,
    recipe: dict[str, Any],
    *,
    frame: int,
    width: int,
    height: int,
) -> dict[str, Any]:
    """Return arrays/json/preview for Seed Artifact creation."""
    seed = int(recipe.get("seed", 42)) & 0xFFFFFFFF
    params = recipe.get("parameters") or {}
    out: dict[str, Any] = {
        "arrays": {},
        "json_blobs": {},
        "preview_png": None,
        "geometry_ir": None,
        "artifact_type": "parameter-state",
    }

    if piece_id in {"geometry/seed-of-life", "geometry/metatron", "reference/circle-lattice"} or (
        piece_id.endswith("circle-lattice")
    ):
        r = float(params.get("geom.radius", 1.0))
        if "seed-of-life" in piece_id:
            centers = seed_of_life_centers(r)
            ir = geometry_ir_from_centers(centers, r)
        elif "metatron" in piece_id:
            centers = flower_of_life_centers(r, levels=int(params.get("geom.levels", 1)))
            ir = geometry_ir_from_centers(centers, r, edges=metatron_lines(centers))
        else:
            ir = gen_lattice(recipe)
        out["geometry_ir"] = ir
        out["artifact_type"] = "geometry"
        out["json_blobs"]["meta"] = {"frame": frame, "radius": r}
        return out

    if piece_id == "flagship/latticefall":
        world = build_world(recipe)
        out["json_blobs"]["world"] = world
        out["artifact_type"] = "world"
        out["json_blobs"]["meta"] = {"frame": frame}
        return out

    if piece_id == "reaction-diffusion/reaction-diffusion":
        # frame maps to iteration count for deterministic exact-frame semantics
        iters = int(frame) if frame > 0 else int(params.get("iterations", 400))
        # keep gallery/seed creation responsive
        iters = min(iters, 2500)
        u, v = simulate_reaction_diffusion(
            width,
            height,
            seed,
            iterations=iters,
            f=float(params.get("f", 0.055)),
            k=float(params.get("k", 0.062)),
        )
        out["arrays"]["U"] = u
        out["arrays"]["V"] = v
        out["artifact_type"] = "simulation-state"
        out["preview_png"] = _preview_from_field(v)
        out["json_blobs"]["meta"] = {"iterations": iters, "frame": frame}
        return out

    if piece_id == "growth/slime-mold":
        steps = int(frame) if frame > 0 else int(params.get("steps", 200))
        steps = min(steps, 800)
        agents, trail = simulate_slime(
            width,
            height,
            seed,
            steps=steps,
            num_agents=int(params.get("num_agents", 800)),
        )
        out["arrays"]["agents"] = agents
        out["arrays"]["trail"] = trail
        out["artifact_type"] = "agent-state"
        out["preview_png"] = _preview_from_field(trail / max(float(trail.max()), 1e-6))
        out["json_blobs"]["meta"] = {"steps": steps, "frame": frame}
        return out

    # Generic still via sketch render when available
    sketch_map = {
        "particles/noodles": "noodles",
        "fields/nebula": "nebula",
        "fields/flow-hatching": "flow_hatching",
        "fractals/strange-attractors": "strange_attractors",
        "fractals/sdf-raymarch2d": "sdf_raymarch2d",
        "growth/differential-growth": "differential_growth",
        "growth/lsystem": "lsystem",
        "geometry/circle-packing": "circle_packing",
        "tiling/truchet-tiles": "truchet_tiles",
        "tiling/voronoi-stained-glass": "voronoi_stained_glass",
        "landscape/noise-landscape": None,
    }
    if piece_id in {"landscape/noise-landscape", "reference/noise-landscape"}:
        from numbrane_python.landscape.noise_landscape import render_noise_landscape

        img = render_noise_landscape(recipe)
        arr = np.asarray(img.convert("RGB"), dtype=np.uint8)
        out["arrays"]["raster"] = arr
        out["preview_png"] = arr
        out["artifact_type"] = "raster"
        return out

    if piece_id in sketch_map and sketch_map[piece_id]:
        import importlib

        mod = importlib.import_module(f"numbrane_python.sketches.{sketch_map[piece_id]}")
        ctx, kwargs = recipe_to_render_context(recipe, frame=frame)
        config_cls = getattr(mod, next(n for n in dir(mod) if n.endswith("Config")))
        fields = getattr(config_cls, "model_fields", {})
        filtered = {k: v for k, v in kwargs.items() if k in fields}
        # reduce heavy defaults for seed creation
        for heavy, capped in (("iterations", 800), ("steps", 300), ("max_steps", 200)):
            if heavy in fields and heavy not in filtered:
                filtered[heavy] = capped
            elif heavy in filtered:
                filtered[heavy] = min(int(filtered[heavy]), capped)
        if frame > 0 and "iterations" in fields:
            filtered["iterations"] = min(frame, 2500)
        if frame > 0 and "steps" in fields:
            filtered["steps"] = min(frame, 800)
        config = config_cls(**filtered)
        result = mod.render(config, ctx)
        image = getattr(result, "image", None)
        if isinstance(image, Image.Image):
            arr = np.asarray(image.convert("RGB"), dtype=np.uint8)
        else:
            arr = np.asarray(image)
            if arr.dtype != np.uint8:
                arr = (np.clip(arr, 0, 1) * 255).astype(np.uint8)
        out["arrays"]["raster"] = arr
        out["preview_png"] = arr
        out["artifact_type"] = "raster"
        out["json_blobs"]["parameters"] = filtered
        # differential growth: also store a parameter snapshot for continuation metadata
        if piece_id == "growth/differential-growth":
            out["artifact_type"] = "simulation-state"
        if piece_id == "growth/lsystem":
            out["artifact_type"] = "parameter-state"
        return out

    # Fallback parameter-state only
    out["json_blobs"]["recipe"] = recipe
    out["artifact_type"] = "parameter-state"
    return out


def advance_from_artifact_state(
    piece_id: str,
    arrays: dict[str, np.ndarray],
    meta: dict[str, Any],
    recipe: dict[str, Any],
    *,
    extra_steps: int,
) -> dict[str, Any]:
    """Continue simulation from saved arrays."""
    seed = int(recipe.get("seed", 42)) & 0xFFFFFFFF
    params = recipe.get("parameters") or {}
    if piece_id == "reaction-diffusion/reaction-diffusion":
        u, v = simulate_reaction_diffusion(
            int(arrays["U"].shape[1]),
            int(arrays["U"].shape[0]),
            seed,
            iterations=extra_steps,
            f=float(params.get("f", 0.055)),
            k=float(params.get("k", 0.062)),
            u0=arrays["U"],
            v0=arrays["V"],
        )
        return {
            "arrays": {"U": u, "V": v},
            "preview_png": _preview_from_field(v),
            "meta": {**meta, "iterations": int(meta.get("iterations", 0)) + extra_steps},
            "artifact_type": "simulation-state",
        }
    if piece_id == "growth/slime-mold":
        agents, trail = simulate_slime(
            int(arrays["trail"].shape[1]),
            int(arrays["trail"].shape[0]),
            seed,
            steps=extra_steps,
            agents0=arrays["agents"],
            trail0=arrays["trail"],
            num_agents=int(arrays["agents"].shape[0]),
        )
        return {
            "arrays": {"agents": agents, "trail": trail},
            "preview_png": _preview_from_field(trail / max(float(trail.max()), 1e-6)),
            "meta": {**meta, "steps": int(meta.get("steps", 0)) + extra_steps},
            "artifact_type": "agent-state",
        }
    raise ValueError(f"continuation not supported for {piece_id}")
