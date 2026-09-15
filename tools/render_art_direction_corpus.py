#!/usr/bin/env python3
"""Render art-direction review corpus into artifacts/art-direction/ (gitignored)."""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engines" / "python" / "src"))

from numbrane_python.core.ctx import Quality, RenderContext  # noqa: E402
from numbrane_python.core.rng import RNG  # noqa: E402
from numbrane_python.sketches import (  # noqa: E402
    differential_growth,
    flow_hatching,
    noodles,
    reaction_diffusion,
    slime_mold,
    strange_attractors,
    truchet_tiles,
    voronoi_stained_glass,
)

OUT = ROOT / "artifacts" / "art-direction"
SELECTED = OUT / "selected"

CORPUS = [
    (
        "fractals/strange-attractors",
        "fine-ink-ritual",
        strange_attractors,
        "StrangeAttractorsConfig",
        {
            "render_mode": "fine-ink",
            "pfl_style": "pfl-ritual",
            "palette": "bone-black",
            "steps": 28000,
            "burn_in": 400,
        },
        list(range(100, 116)),
    ),
    (
        "fields/flow-hatching",
        "ring-signal",
        flow_hatching,
        "FlowHatchingConfig",
        {
            "mask": "ring",
            "pfl_style": "pfl-signal",
            "density": 0.35,
            "line_spacing": 12.0,
            "streamline_steps": 8,
            "field_octaves": 2,
        },
        list(range(200, 212)),
    ),
    (
        "particles/noodles",
        "sparse-organism",
        noodles,
        "NoodlesConfig",
        {
            "pfl_style": "pfl-organism",
            "density": 0.55,
            "trail_persistence": 0.85,
            "num_particles": 36,
            "max_steps": 120,
            "field_octaves": 2,
        },
        list(range(300, 312)),
    ),
    (
        "reaction-diffusion/reaction-diffusion",
        "lace-ritual",
        reaction_diffusion,
        "ReactionDiffusionConfig",
        {
            "evolved_preset": "lace",
            "initial_condition": "ring",
            "pfl_style": "pfl-ritual",
            "iterations": 120,
        },
        list(range(400, 412)),
    ),
    (
        "growth/slime-mold",
        "constellation",
        slime_mold,
        "SlimeMoldConfig",
        {"nutrient_layout": "constellation", "pfl_style": "pfl-organism", "steps": 70},
        list(range(500, 512)),
    ),
    (
        "growth/differential-growth",
        "islands",
        differential_growth,
        "DifferentialGrowthConfig",
        {"initial_topology": "islands", "pfl_style": "pfl-organism", "steps": 45},
        list(range(600, 608)),
    ),
    (
        "tiling/voronoi-stained-glass",
        "clustered-machine",
        voronoi_stained_glass,
        "VoronoiStainedGlassConfig",
        {"site_distribution": "clustered", "pfl_style": "pfl-machine", "num_points": 28},
        list(range(700, 708)),
    ),
    (
        "tiling/truchet-tiles",
        "field-driven",
        truchet_tiles,
        "TruchetTilesConfig",
        {"field_driven_orientation": True, "pfl_style": "pfl-machine", "tile_scale": 1.5},
        list(range(800, 808)),
    ),
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    SELECTED.mkdir(parents=True, exist_ok=True)
    manifest: list[dict] = []
    times: list[float] = []
    total = 0
    for piece, recipe, mod, cfg_name, params, seeds in CORPUS:
        piece_dir = OUT / piece.replace("/", "__") / recipe
        piece_dir.mkdir(parents=True, exist_ok=True)
        cfg_cls = getattr(mod, cfg_name)
        for seed in seeds:
            t0 = time.perf_counter()
            try:
                filtered = {k: v for k, v in params.items() if k in cfg_cls.model_fields}
                cfg = cfg_cls(seed=seed, width=360, height=360, **filtered)
                ctx = RenderContext(
                    rng=RNG(seed),
                    width=360,
                    height=360,
                    quality=Quality(mode="preview", supersample=1),
                )
                result = mod.render(cfg, ctx)
                path = piece_dir / f"s{seed}.png"
                result.save(path, save_metadata=False)
                ms = (time.perf_counter() - t0) * 1000
                times.append(ms)
                total += 1
                manifest.append(
                    {
                        "piece": piece,
                        "recipe": recipe,
                        "seed": seed,
                        "path": str(path.relative_to(ROOT)),
                        "ms": round(ms, 1),
                        "params": params,
                    }
                )
                print(f"ok {piece} {recipe} seed={seed} {ms:.0f}ms")
            except Exception as e:  # noqa: BLE001
                print(f"FAIL {piece} seed={seed}: {e}")
                manifest.append(
                    {
                        "piece": piece,
                        "recipe": recipe,
                        "seed": seed,
                        "error": str(e),
                        "params": params,
                    }
                )

    times_sorted = sorted(times)
    summary = {
        "total_ok": total,
        "median_ms": times_sorted[len(times_sorted) // 2] if times_sorted else None,
        "p90_ms": times_sorted[int(len(times_sorted) * 0.9)] if times_sorted else None,
        "max_ms": max(times) if times else None,
        "items": manifest,
    }
    (OUT / "manifest.json").write_text(json.dumps(summary, indent=2))
    (SELECTED / "README.txt").write_text(
        "Copy the best 12–24 PNGs here after human review. Keep gitignored.\n"
    )
    print(
        f"\nDone: {total} images. median={summary['median_ms']}ms "
        f"p90={summary['p90_ms']}ms max={summary['max_ms']}ms"
    )


if __name__ == "__main__":
    main()
