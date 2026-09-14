#!/usr/bin/env python3
"""NUMBRANE piece CLI — list, inspect, render (Python engine + geometry/landscape)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engines" / "python" / "src"))

SKETCH_MAP = {
    "particles/noodles": "noodles",
    "reaction-diffusion/reaction-diffusion": "reaction_diffusion",
    "growth/lsystem": "lsystem",
    "fields/nebula": "nebula",
    "fractals/sdf-raymarch2d": "sdf_raymarch2d",
    "fields/flow-hatching": "flow_hatching",
    "geometry/circle-packing": "circle_packing",
    "growth/differential-growth": "differential_growth",
    "growth/slime-mold": "slime_mold",
    "fractals/strange-attractors": "strange_attractors",
    "tiling/truchet-tiles": "truchet_tiles",
    "tiling/voronoi-stained-glass": "voronoi_stained_glass",
    "mashups/attractor-calligraphy": "mashups.attractor_calligraphy",
    "mashups/bureaucratic-growth-forms": "mashups.bureaucratic_growth_forms",
    "mashups/cosmic-venation-tiles": "mashups.cosmic_venation_tiles",
    "mashups/ritual-diagrams": "mashups.ritual_diagrams",
    "mashups/slime-on-sdf": "mashups.slime_on_sdf",
    "mashups/striped-worms-eating-boxes": "mashups.striped_worms_eating_boxes",
}


def discover_manifests() -> list[dict]:
    pieces = []
    for path in sorted((ROOT / "pieces").rglob("manifest.json")):
        data = json.loads(path.read_text())
        data["_manifest_path"] = str(path.relative_to(ROOT))
        pieces.append(data)
    return pieces


def cmd_pieces(_: argparse.Namespace) -> int:
    rows = discover_manifests()
    print(f"{'ID':40} {'ENGINE':8} {'DET':3} {'NAME'}")
    print("-" * 80)
    for m in rows:
        caps = m.get("capabilities", {})
        det = "Y" if caps.get("deterministic") else "N"
        print(f"{m['piece_id']:40} {m.get('backend', '?'):8} {det:3} {m.get('name', '')}")
    print(f"\n{len(rows)} pieces")
    return 0


def cmd_inspect(args: argparse.Namespace) -> int:
    for m in discover_manifests():
        if m["piece_id"] == args.piece:
            print(json.dumps({k: v for k, v in m.items() if not k.startswith("_")}, indent=2))
            print(f"manifest: {m['_manifest_path']}")
            return 0
    print(f"piece not found: {args.piece}", file=sys.stderr)
    return 1


def _load_recipe(args: argparse.Namespace) -> dict:
    if args.recipe:
        return json.loads(Path(args.recipe).read_text())
    # find default recipe next to manifest
    for m in discover_manifests():
        if m["piece_id"] == args.piece:
            manifest_dir = ROOT / Path(m["_manifest_path"]).parent
            candidates = [
                manifest_dir / "recipe.json",
                manifest_dir / "recipe.default.json",
            ]
            recipe = None
            for recipe_path in candidates:
                if recipe_path.exists():
                    recipe = json.loads(recipe_path.read_text())
                    break
            if recipe is None:
                recipe = {
                    "protocol_version": "0.1.0",
                    "piece_id": args.piece,
                    "backend": m.get("backend", "python"),
                    "seed": args.seed,
                    "parameters": {"output.width": 256, "output.height": 256},
                }
            recipe["seed"] = args.seed
            return recipe
    raise SystemExit(f"piece not found: {args.piece}")


def cmd_render(args: argparse.Namespace) -> int:
    recipe = _load_recipe(args)
    piece = args.piece
    out = (
        Path(args.output) if args.output else ROOT / "artifacts" / f"{piece.replace('/', '_')}.png"
    )
    out.parent.mkdir(parents=True, exist_ok=True)

    if piece == "flagship/latticefall":
        from numbrane_python.pieces.latticefall import build_world

        world = build_world(recipe)
        out = out.with_suffix(".json")
        out.write_text(json.dumps(world, indent=2))
        print(out)
        return 0

    from numbrane_python.geometry.lattice import (
        flower_of_life_centers,
        geometry_ir_from_centers,
        metatron_lines,
        seed_of_life_centers,
    )
    from numbrane_python.landscape.noise_landscape import render_noise_landscape
    from numbrane_python.nap.adapter import recipe_to_render_context
    from numbrane_python.pieces.circle_lattice import generate as gen_lattice

    if piece in {"reference/circle-lattice", "geometry/circle-lattice"}:
        ir = gen_lattice(recipe)
        out = out.with_suffix(".json")
        out.write_text(json.dumps(ir, indent=2))
        print(out)
        return 0

    if piece == "geometry/seed-of-life":
        r = float(recipe.get("parameters", {}).get("geom.radius", 1.0))
        ir = geometry_ir_from_centers(seed_of_life_centers(r), r)
        out = out.with_suffix(".json")
        out.write_text(json.dumps(ir, indent=2))
        print(out)
        return 0

    if piece == "geometry/metatron":
        r = float(recipe.get("parameters", {}).get("geom.radius", 1.0))
        centers = flower_of_life_centers(
            r, levels=int(recipe.get("parameters", {}).get("geom.levels", 1))
        )
        ir = geometry_ir_from_centers(centers, r, edges=metatron_lines(centers))
        out = out.with_suffix(".json")
        out.write_text(json.dumps(ir, indent=2))
        print(out)
        return 0

    if piece in {"landscape/noise-landscape", "reference/noise-landscape"}:
        img = render_noise_landscape(recipe)
        img.save(out)
        print(out)
        return 0

    if piece in SKETCH_MAP:
        import importlib

        mod = importlib.import_module(f"numbrane_python.sketches.{SKETCH_MAP[piece]}")
        ctx, kwargs = recipe_to_render_context(recipe)
        # Filter kwargs to config model fields when possible
        config_cls = getattr(mod, next(n for n in dir(mod) if n.endswith("Config")), None)
        if config_cls is not None:
            fields = getattr(config_cls, "model_fields", None) or getattr(
                config_cls, "__fields__", {}
            )
            filtered = {k: v for k, v in kwargs.items() if k in fields}
            # ensure required size/seed
            for k in ("seed", "width", "height"):
                if k in fields and k in kwargs:
                    filtered[k] = kwargs[k]
            config = config_cls(**filtered)
        else:
            config = kwargs
        result = mod.render(config, ctx)
        # RenderResult typically has image attribute
        from PIL import Image
        import numpy as np

        image = getattr(result, "image", None)
        if image is None:
            image = getattr(result, "canvas", None)
        if isinstance(image, Image.Image):
            image.save(out)
        elif hasattr(result, "save"):
            result.save(out)
        else:
            arr = np.asarray(image if image is not None else result)
            if arr.dtype != np.uint8:
                if arr.max() <= 1.0:
                    arr = (arr * 255).clip(0, 255)
                arr = arr.astype("uint8")
            Image.fromarray(arr).save(out)
        print(out)
        return 0

    if (
        piece.startswith("audiovisual/")
        or piece.startswith("fractals/escape")
        or piece.startswith("reference/escape")
    ):
        print(
            f"Piece {piece} is web-engine hosted. Launch with: just dev-web",
            file=sys.stderr,
        )
        return 0

    print(f"No python renderer wired for {piece}", file=sys.stderr)
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(prog="numbrane")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("pieces", help="List pieces")
    p.set_defaults(func=cmd_pieces)

    p = sub.add_parser("inspect", help="Inspect a piece manifest")
    p.add_argument("piece")
    p.set_defaults(func=cmd_inspect)

    p = sub.add_parser("render", help="Render a piece")
    p.add_argument("piece")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--recipe")
    p.add_argument("--output", "-o")
    p.set_defaults(func=cmd_render)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
