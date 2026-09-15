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


def simulate_differential_growth(
    width: int,
    height: int,
    seed: int,
    *,
    steps: int,
    num_seeds: int = 5,
    growth_rate: float = 0.5,
    branch_angle: float = 45.0,
    branch_prob: float = 0.02,
    max_length: float = 500.0,
    vein_thickness: float = 2.0,
    segments0: np.ndarray | None = None,
    start_step: int = 0,
) -> np.ndarray:
    """Return segments as Nx7: sx,sy,ex,ey,thickness,age,alive.

    Branching decisions are a pure function of (seed, absolute_step, segment_index)
    so warm-start continuation matches a longer direct run.
    """
    rng = np.random.default_rng(seed)
    if segments0 is None:
        segs: list[list[float]] = []
        for _ in range(num_seeds):
            sx, sy = float(rng.uniform(0, width)), float(rng.uniform(0, height))
            ang = float(rng.uniform(0, 2 * np.pi))
            length = float(rng.uniform(10, 30))
            segs.append(
                [
                    sx,
                    sy,
                    sx + np.cos(ang) * length,
                    sy + np.sin(ang) * length,
                    vein_thickness,
                    0.0,
                    1.0,
                ]
            )
        segments = np.asarray(segs, dtype=np.float32)
    else:
        segments = segments0.astype(np.float32).copy()

    def _u01(step: int, idx: int, salt: int) -> float:
        x = (
            seed * 374761393 + step * 668265263 + idx * 1274126177 + salt * 2246822519
        ) & 0xFFFFFFFF
        x = (x ^ (x >> 13)) * 1274126177 & 0xFFFFFFFF
        return (x & 0xFFFF) / 65535.0

    for s in range(start_step, start_step + max(0, steps)):
        new_rows: list[np.ndarray] = []
        for i in range(segments.shape[0]):
            if segments[i, 6] < 0.5:
                continue
            sx, sy, ex, ey = segments[i, 0:4]
            dx, dy = ex - sx, ey - sy
            length = float(np.hypot(dx, dy))
            if length >= max_length:
                continue
            angle = float(np.arctan2(dy, dx))
            growth = growth_rate * (1.0 - length / max_length)
            nex = float(np.clip(ex + np.cos(angle) * growth, 0, width))
            ney = float(np.clip(ey + np.sin(angle) * growth, 0, height))
            segments[i, 2] = nex
            segments[i, 3] = ney
            segments[i, 5] += 1.0
            if _u01(s, i, 1) < branch_prob and length > 20:
                ba = angle + np.deg2rad((_u01(s, i, 2) * 2 - 1) * branch_angle)
                bl = 5.0 + _u01(s, i, 3) * 10.0
                bx = float(np.clip(nex + np.cos(ba) * bl, 0, width))
                by = float(np.clip(ney + np.sin(ba) * bl, 0, height))
                thick = float(segments[i, 4] * (0.7 + 0.2 * _u01(s, i, 4)))
                new_rows.append(np.array([nex, ney, bx, by, thick, 0.0, 1.0], dtype=np.float32))
        if new_rows:
            segments = np.vstack([segments, np.stack(new_rows)])
    return segments


def _segments_preview(segments: np.ndarray, width: int, height: int) -> np.ndarray:
    img = np.zeros((height, width, 3), dtype=np.uint8)
    for row in segments:
        x0, y0, x1, y1 = map(int, row[0:4])
        n = max(2, int(np.hypot(x1 - x0, y1 - y0)))
        for t in np.linspace(0, 1, n):
            x = int(x0 + (x1 - x0) * t)
            y = int(y0 + (y1 - y0) * t)
            if 0 <= x < width and 0 <= y < height:
                img[y, x] = (200, 220, 255)
    return img


def simulate_lsystem(
    seed: int,
    *,
    generations: int,
    axiom: str = "F",
    rules: dict[str, str] | None = None,
    current: str | None = None,
) -> tuple[str, int]:
    """Advance L-system rewrite; return (string, generation_count_after)."""
    del seed  # grammar is deterministic; seed reserved for future stochastic rules
    rules = rules or {"F": "F[+F]F[-F]F"}
    if current is None:
        s = axiom
        for _ in range(max(0, generations)):
            s = "".join(rules.get(ch, ch) for ch in s)
        return s, max(0, generations)
    s = current
    for _ in range(max(0, generations)):
        s = "".join(rules.get(ch, ch) for ch in s)
    # caller tracks absolute generation via meta; here generations = extra rewrites
    return s, max(0, generations)


def _lsystem_preview(
    string: str,
    width: int,
    height: int,
    *,
    angle: float = 25.0,
    step_size: float = 8.0,
) -> np.ndarray:
    img = np.zeros((height, width, 3), dtype=np.uint8)
    stack: list[tuple[float, float, float]] = []
    x, y, ang = width / 2, float(height) * 0.95, -90.0
    for ch in string[:8000]:
        if ch == "F":
            nx = x + np.cos(np.deg2rad(ang)) * step_size
            ny = y + np.sin(np.deg2rad(ang)) * step_size
            x0, y0, x1, y1 = int(x), int(y), int(nx), int(ny)
            n = max(2, int(np.hypot(x1 - x0, y1 - y0)))
            for t in np.linspace(0, 1, n):
                px = int(x0 + (x1 - x0) * t)
                py = int(y0 + (y1 - y0) * t)
                if 0 <= px < width and 0 <= py < height:
                    img[py, px] = (180, 230, 160)
            x, y = nx, ny
        elif ch == "+":
            ang += angle
        elif ch == "-":
            ang -= angle
        elif ch == "[":
            stack.append((x, y, ang))
        elif ch == "]" and stack:
            x, y, ang = stack.pop()
    return img


def simulate_noodles(
    width: int,
    height: int,
    seed: int,
    *,
    steps: int,
    num_particles: int = 80,
    positions0: np.ndarray | None = None,
    field_scale: float = 0.5,
    dt: float = 0.1,
    start_step: int = 0,
) -> np.ndarray:
    """Return positions Nx2 after ``steps`` curl-noise advection."""
    rng = np.random.default_rng(seed)
    if positions0 is None:
        # border emit
        pos = np.zeros((num_particles, 2), dtype=np.float32)
        for i in range(num_particles):
            side = int(rng.integers(0, 4))
            if side == 0:
                pos[i] = [rng.uniform(0, width), 0]
            elif side == 1:
                pos[i] = [rng.uniform(0, width), height - 1]
            elif side == 2:
                pos[i] = [0, rng.uniform(0, height)]
            else:
                pos[i] = [width - 1, rng.uniform(0, height)]
    else:
        pos = positions0.astype(np.float32).copy()

    def curl(x: float, y: float, t: float) -> tuple[float, float]:
        # cheap deterministic curl from hash noise
        n1 = np.sin(x * field_scale * 0.01 + t) * np.cos(y * field_scale * 0.01)
        n2 = np.cos(x * field_scale * 0.013 - t) * np.sin(y * field_scale * 0.011)
        return float(n2), float(-n1)

    for step in range(start_step, start_step + max(0, steps)):
        t = step * 0.05
        for i in range(pos.shape[0]):
            vx, vy = curl(float(pos[i, 0]), float(pos[i, 1]), t)
            pos[i, 0] = (pos[i, 0] + vx * dt * 20) % width
            pos[i, 1] = (pos[i, 1] + vy * dt * 20) % height
    return pos


def _points_preview(
    points: np.ndarray, width: int, height: int, normalized: bool = False
) -> np.ndarray:
    img = np.zeros((height, width, 3), dtype=np.uint8)
    for p in points:
        x = int(p[0] * width) if normalized else int(p[0])
        y = int(p[1] * height) if normalized else int(p[1])
        for dy in range(-1, 2):
            for dx in range(-1, 2):
                xx, yy = x + dx, y + dy
                if 0 <= xx < width and 0 <= yy < height:
                    img[yy, xx] = (220, 200, 120)
    return img


def simulate_voronoi_sites(
    seed: int,
    *,
    num_points: int = 50,
    sites0: np.ndarray | None = None,
    steps: int = 0,
) -> np.ndarray:
    """Sites in [0,1]^2; optional drift steps for temporal evolution."""
    rng = np.random.default_rng(seed)
    if sites0 is None:
        sites = rng.random((num_points, 2), dtype=np.float32)
    else:
        sites = sites0.astype(np.float32).copy()
    for s in range(max(0, steps)):
        sites += (rng.random(sites.shape, dtype=np.float32) - 0.5) * 0.002
        sites = np.mod(sites, 1.0)
    return sites


def simulate_circle_packing(
    width: int,
    height: int,
    seed: int,
    *,
    attempts: int,
    min_radius: float = 5.0,
    max_radius: float = 50.0,
    min_distance: float = 2.0,
    circles0: np.ndarray | None = None,
) -> np.ndarray:
    """Return circles Nx3 (x,y,r). ``attempts`` additional placement tries."""
    rng = np.random.default_rng(seed)
    circles: list[list[float]]
    if circles0 is None:
        circles = []
    else:
        circles = circles0.astype(np.float32).tolist()
    for _ in range(max(0, attempts)):
        x = float(rng.uniform(0, width))
        y = float(rng.uniform(0, height))
        r = float(rng.uniform(min_radius, max_radius))
        ok = True
        for cx, cy, cr in circles:
            if np.hypot(x - cx, y - cy) < r + cr + min_distance:
                ok = False
                break
        if ok:
            circles.append([x, y, r])
    return np.asarray(circles, dtype=np.float32) if circles else np.zeros((0, 3), dtype=np.float32)


def _circles_preview(circles: np.ndarray, width: int, height: int) -> np.ndarray:
    img = np.zeros((height, width, 3), dtype=np.uint8)
    yy, xx = np.ogrid[:height, :width]
    for cx, cy, r in circles:
        mask = (xx - cx) ** 2 + (yy - cy) ** 2 <= r**2
        edge = ((xx - cx) ** 2 + (yy - cy) ** 2 <= (r + 1) ** 2) & ~mask
        img[mask] = (40, 60, 90)
        img[edge] = (200, 210, 230)
    return img


def _preview_from_field(field: np.ndarray, palette: str = "ink") -> np.ndarray:
    f = np.asarray(field, dtype=np.float32)
    f = (f - f.min()) / (f.max() - f.min() + 1e-6)
    # Early/low-iteration fields need contrast lift for gallery readability
    f = np.power(np.clip(f * 1.15, 0, 1), 0.75)
    colors = gradient_map(f, get_palette(palette))
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

    if piece_id in {
        "geometry/seed-of-life",
        "geometry/metatron",
        "geometry/flower-of-life",
        "geometry/sri-yantra",
        "geometry/isometric",
        "reference/circle-lattice",
    } or piece_id.endswith("circle-lattice"):
        r = float(params.get("geom.radius", 1.0))
        if "seed-of-life" in piece_id:
            centers = seed_of_life_centers(r)
            ir = geometry_ir_from_centers(centers, r)
        elif "metatron" in piece_id:
            from numbrane_python.composition.grammar import apply_geometry_composition

            comp_mode = str(params.get("composition_mode", params.get("comp.mode", "canonical")))
            centers = flower_of_life_centers(r, levels=int(params.get("geom.levels", 1)))
            ir = geometry_ir_from_centers(centers, r, edges=metatron_lines(centers))
            ir = apply_geometry_composition(ir, comp_mode, seed=int(recipe.get("seed", 42)))
        elif "flower-of-life" in piece_id or "sri-yantra" in piece_id or "isometric" in piece_id:
            from numbrane_python.geometry.sacred import build_sacred_geometry_ir

            comp_mode = str(params.get("composition_mode", params.get("comp.mode", "canonical")))
            ir = build_sacred_geometry_ir(
                piece_id,
                radius=r,
                layers=int(params.get("geom.layers", 3)),
                scale=float(params.get("geom.scale", r)),
                seed=int(recipe.get("seed", 42)),
                composition_mode=comp_mode,
            )
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

    if piece_id == "growth/differential-growth":
        steps = int(frame) if frame > 0 else int(params.get("steps", 120))
        steps = min(steps, 400)
        segs = simulate_differential_growth(
            width,
            height,
            seed,
            steps=steps,
            num_seeds=int(params.get("num_seeds", 5)),
            growth_rate=float(params.get("growth_rate", 0.5)),
            branch_prob=float(params.get("branch_prob", 0.02)),
        )
        out["arrays"]["segments"] = segs
        out["artifact_type"] = "simulation-state"
        out["preview_png"] = _segments_preview(segs, width, height)
        out["json_blobs"]["meta"] = {
            "steps": steps,
            "frame": frame,
            "width": width,
            "height": height,
        }
        return out

    if piece_id == "growth/lsystem":
        gens = int(frame) if frame > 0 else int(params.get("iterations", 4))
        gens = min(gens, 7)
        rules = params.get("rules") or {"F": "F[+F]F[-F]F"}
        if isinstance(rules, str):
            rules = {"F": rules}
        string, gen = simulate_lsystem(
            seed,
            generations=gens,
            axiom=str(params.get("axiom", "F")),
            rules=rules,
        )
        out["json_blobs"]["lsystem"] = {
            "string": string,
            "generation": gen,
            "axiom": params.get("axiom", "F"),
            "rules": rules,
            "angle": float(params.get("angle", 25.0)),
        }
        out["artifact_type"] = "parameter-state"
        out["preview_png"] = _lsystem_preview(
            string, width, height, angle=float(params.get("angle", 25.0))
        )
        out["json_blobs"]["meta"] = {"generations": gen, "frame": frame}
        return out

    if piece_id == "particles/noodles":
        steps = int(frame) if frame > 0 else int(params.get("max_steps", 200))
        steps = min(steps, 600)
        pos = simulate_noodles(
            width,
            height,
            seed,
            steps=steps,
            num_particles=int(params.get("num_particles", 80)),
        )
        out["arrays"]["positions"] = pos
        out["artifact_type"] = "agent-state"
        out["preview_png"] = _points_preview(pos, width, height)
        out["json_blobs"]["meta"] = {"steps": steps, "frame": frame}
        return out

    if piece_id == "tiling/voronoi-stained-glass":
        sites = simulate_voronoi_sites(
            seed,
            num_points=int(params.get("num_points", 50)),
            steps=max(0, int(frame)),
        )
        out["arrays"]["sites"] = sites
        out["artifact_type"] = "geometry"
        out["preview_png"] = _points_preview(sites, width, height, normalized=True)
        out["json_blobs"]["meta"] = {"frame": frame, "num_points": int(sites.shape[0])}
        return out

    if piece_id == "geometry/circle-packing":
        attempts = int(frame) if frame > 0 else int(params.get("num_attempts", 2000))
        attempts = min(attempts, 5000)
        circles = simulate_circle_packing(
            width,
            height,
            seed,
            attempts=attempts,
            min_radius=float(params.get("min_radius", 5.0)),
            max_radius=float(params.get("max_radius", 50.0)),
        )
        out["arrays"]["circles"] = circles
        out["artifact_type"] = "geometry"
        out["preview_png"] = _circles_preview(circles, width, height)
        out["json_blobs"]["meta"] = {
            "attempts": attempts,
            "frame": frame,
            "count": int(circles.shape[0]),
        }
        return out

    # Generic still via sketch render when available
    sketch_map = {
        "fields/nebula": "nebula",
        "fields/flow-hatching": "flow_hatching",
        "fractals/strange-attractors": "strange_attractors",
        "fractals/sdf-raymarch2d": "sdf_raymarch2d",
        "tiling/truchet-tiles": "truchet_tiles",
        "mashups/attractor-calligraphy": "mashups.attractor_calligraphy",
        "mashups/bureaucratic-growth-forms": "mashups.bureaucratic_growth_forms",
        "mashups/cosmic-venation-tiles": "mashups.cosmic_venation_tiles",
        "mashups/ritual-diagrams": "mashups.ritual_diagrams",
        "mashups/slime-on-sdf": "mashups.slime_on_sdf",
        "mashups/striped-worms-eating-boxes": "mashups.striped_worms_eating_boxes",
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

    if piece_id in {"fractals/escape-time", "reference/escape-time"}:
        from numbrane_python.pieces.escape_time import render_escape_time

        arr = render_escape_time(recipe, width=width, height=height, frame=frame)
        out["arrays"]["raster"] = arr
        out["preview_png"] = arr
        out["artifact_type"] = "complex-plane-state"
        out["json_blobs"]["meta"] = {
            "frame": frame,
            "center": params.get("center", [-0.5, 0.0]),
            "zoom": float(params.get("zoom", 1.0)),
        }
        return out

    if piece_id in sketch_map and sketch_map[piece_id]:
        import importlib

        mod_name = sketch_map[piece_id]
        mod = importlib.import_module(f"numbrane_python.sketches.{mod_name}")
        ctx, kwargs = recipe_to_render_context(recipe, frame=frame)
        config_cls = getattr(mod, next(n for n in dir(mod) if n.endswith("Config")))
        fields = getattr(config_cls, "model_fields", {})
        filtered = {k: v for k, v in kwargs.items() if k in fields}
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
    json_blobs: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Continue simulation from saved arrays."""
    seed = int(recipe.get("seed", 42)) & 0xFFFFFFFF
    params = recipe.get("parameters") or {}
    blobs = json_blobs or {}
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
            "json_blobs": {},
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
            "json_blobs": {},
            "preview_png": _preview_from_field(trail / max(float(trail.max()), 1e-6)),
            "meta": {**meta, "steps": int(meta.get("steps", 0)) + extra_steps},
            "artifact_type": "agent-state",
        }
    if piece_id == "growth/differential-growth":
        w = int(meta.get("width") or recipe.get("parameters", {}).get("width") or 256)
        h = int(meta.get("height") or recipe.get("parameters", {}).get("height") or 256)
        if "segments" in arrays:
            w = max(w, int(arrays["segments"][:, [0, 2]].max()) + 1)
            h = max(h, int(arrays["segments"][:, [1, 3]].max()) + 1)
        segs = simulate_differential_growth(
            w,
            h,
            seed,
            steps=extra_steps,
            segments0=arrays["segments"],
            growth_rate=float(params.get("growth_rate", 0.5)),
            branch_prob=float(params.get("branch_prob", 0.02)),
            start_step=int(meta.get("steps", 0)),
        )
        return {
            "arrays": {"segments": segs},
            "json_blobs": {},
            "preview_png": _segments_preview(segs, w, h),
            "meta": {
                **meta,
                "steps": int(meta.get("steps", 0)) + extra_steps,
                "width": w,
                "height": h,
            },
            "artifact_type": "simulation-state",
        }
    if piece_id == "growth/lsystem":
        ls = blobs.get("lsystem") or {}
        rules = ls.get("rules") or params.get("rules") or {"F": "F[+F]F[-F]F"}
        string, gen = simulate_lsystem(
            seed,
            generations=extra_steps,
            axiom=str(ls.get("axiom", params.get("axiom", "F"))),
            rules=rules,
            current=str(ls.get("string", "F")),
        )
        abs_gen = int(ls.get("generation", 0)) + extra_steps
        w = int(recipe.get("parameters", {}).get("width") or 512)
        h = int(recipe.get("parameters", {}).get("height") or 512)
        return {
            "arrays": {},
            "json_blobs": {
                "lsystem": {
                    **ls,
                    "string": string,
                    "generation": abs_gen,
                    "rules": rules,
                }
            },
            "preview_png": _lsystem_preview(string, w, h, angle=float(ls.get("angle", 25.0))),
            "meta": {**meta, "generations": abs_gen},
            "artifact_type": "parameter-state",
        }
    if piece_id == "particles/noodles":
        w = int(arrays["positions"][:, 0].max()) + 1 if len(arrays["positions"]) else 256
        h = int(arrays["positions"][:, 1].max()) + 1 if len(arrays["positions"]) else 256
        w = max(w, int(recipe.get("parameters", {}).get("width") or 256))
        h = max(h, int(recipe.get("parameters", {}).get("height") or 256))
        pos = simulate_noodles(
            w,
            h,
            seed,
            steps=extra_steps,
            positions0=arrays["positions"],
            start_step=int(meta.get("steps", 0)),
        )
        return {
            "arrays": {"positions": pos},
            "json_blobs": {},
            "preview_png": _points_preview(pos, w, h),
            "meta": {**meta, "steps": int(meta.get("steps", 0)) + extra_steps},
            "artifact_type": "agent-state",
        }
    if piece_id == "tiling/voronoi-stained-glass":
        sites = simulate_voronoi_sites(seed, sites0=arrays["sites"], steps=extra_steps)
        w = int(recipe.get("parameters", {}).get("width") or 512)
        h = int(recipe.get("parameters", {}).get("height") or 512)
        return {
            "arrays": {"sites": sites},
            "json_blobs": {},
            "preview_png": _points_preview(sites, w, h, normalized=True),
            "meta": {**meta, "frame": int(meta.get("frame", 0)) + extra_steps},
            "artifact_type": "geometry",
        }
    if piece_id == "geometry/circle-packing":
        w = int(recipe.get("parameters", {}).get("width") or 512)
        h = int(recipe.get("parameters", {}).get("height") or 512)
        circles = simulate_circle_packing(
            w,
            h,
            seed,
            attempts=extra_steps,
            circles0=arrays.get("circles"),
        )
        return {
            "arrays": {"circles": circles},
            "json_blobs": {},
            "preview_png": _circles_preview(circles, w, h),
            "meta": {**meta, "attempts": int(meta.get("attempts", 0)) + extra_steps},
            "artifact_type": "geometry",
        }
    raise ValueError(f"continuation not supported for {piece_id}")
