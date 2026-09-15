#!/usr/bin/env python3
"""NUMBRANE user CLI — pieces, render, seed artifacts, gallery."""

from __future__ import annotations

import argparse
import json
import os
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

GEOM_SVG_PIECES = {
    "geometry/seed-of-life",
    "geometry/metatron",
    "geometry/flower-of-life",
    "geometry/sri-yantra",
    "geometry/isometric",
    "reference/circle-lattice",
    "geometry/circle-lattice",
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
    print(f"{'ID':40} {'ENGINE':8} {'STILL':5} {'RT':3} {'NAME'}")
    print("-" * 90)
    for m in rows:
        caps = m.get("capabilities", {})
        still = "Y" if caps.get("still") else "N"
        rt = "Y" if caps.get("realtime") else "N"
        print(f"{m['piece_id']:40} {m.get('backend', '?'):8} {still:5} {rt:3} {m.get('name', '')}")
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
        recipe = json.loads(Path(args.recipe).read_text())
    else:
        recipe = None
        for m in discover_manifests():
            if m["piece_id"] != args.piece:
                continue
            manifest_dir = ROOT / Path(m["_manifest_path"]).parent
            for recipe_path in (manifest_dir / "recipe.json", manifest_dir / "recipe.default.json"):
                if recipe_path.exists():
                    recipe = json.loads(recipe_path.read_text())
                    break
            if recipe is None:
                recipe = {
                    "protocol_version": "0.1.0",
                    "piece_id": args.piece,
                    "backend": m.get("backend", "python"),
                    "seed": args.seed,
                    "parameters": {},
                }
            break
        if recipe is None:
            raise SystemExit(f"piece not found: {args.piece}")
    recipe["seed"] = args.seed
    params = dict(recipe.get("parameters") or {})
    # Studio / Docker render service may inject JSON parameter overrides
    extra = os.environ.get("NUMBRANE_RENDER_PARAMS")
    if extra:
        try:
            injected = json.loads(extra)
            if isinstance(injected, dict):
                params.update(injected)
        except json.JSONDecodeError:
            pass
    if getattr(args, "width", None):
        params["width"] = args.width
        params["output.width"] = args.width
    if getattr(args, "height", None):
        params["height"] = args.height
        params["output.height"] = args.height
    if not params.get("width") and not params.get("output.width"):
        params["width"] = params.get("output.width", 1920)
        params["output.width"] = params["width"]
    if not params.get("height") and not params.get("output.height"):
        params["height"] = params.get("output.height", 1080)
        params["output.height"] = params["height"]
    recipe["parameters"] = params
    if getattr(args, "frame", None) is not None:
        recipe.setdefault("time", {})["frame"] = args.frame
    # Preview budgets (same algorithm, lower complexity)
    if os.environ.get("NUMBRANE_RENDER_QUALITY") == "preview":
        piece = recipe.get("piece_id") or getattr(args, "piece", "")
        if piece == "fields/flow-hatching":
            params["line_spacing"] = max(float(params.get("line_spacing", 4)), 7.0)
            params["streamline_steps"] = min(int(params.get("streamline_steps", 24)), 12)
            params["density"] = min(float(params.get("density", 1.0)), 0.55)
        if piece == "particles/noodles":
            params["num_particles"] = min(int(params.get("num_particles", 200)), 40)
            params["max_steps"] = min(int(params.get("max_steps", 2000)), 180)
            params["field_octaves"] = min(int(params.get("field_octaves", 4)), 2)
        if str(piece).startswith("reaction-diffusion"):
            params["iterations"] = min(int(params.get("iterations", 400)), 220)
        if piece == "growth/slime-mold":
            params["steps"] = min(int(params.get("steps", 200)), 120)
        if piece == "fractals/strange-attractors":
            params["steps"] = min(int(params.get("steps", 80000)), 40000)
        recipe["parameters"] = params
    return recipe


def _save_image(image, out: Path) -> None:
    from PIL import Image
    import numpy as np

    if isinstance(image, Image.Image):
        image.save(out)
        return
    arr = np.asarray(image)
    if arr.dtype != np.uint8:
        if arr.max() <= 1.0:
            arr = (arr * 255).clip(0, 255)
        arr = arr.astype("uint8")
    Image.fromarray(arr).save(out)


def cmd_render(args: argparse.Namespace) -> int:
    from numbrane_python.geometry.lattice import (
        flower_of_life_centers,
        geometry_ir_from_centers,
        metatron_lines,
        seed_of_life_centers,
    )
    from numbrane_python.landscape.noise_landscape import render_noise_landscape
    from numbrane_python.nap.adapter import recipe_to_render_context
    from numbrane_python.pieces.circle_lattice import generate as gen_lattice
    from numbrane_python.seeds.svg_export import geometry_ir_to_svg
    from numbrane_python.seeds.sim_state import (
        simulate_reaction_diffusion,
        simulate_slime,
        _preview_from_field,
    )

    recipe = _load_recipe(args)
    piece = args.piece
    frame = int(getattr(args, "frame", 0) or 0)
    fmt = (args.format or "png").lower()
    out = (
        Path(args.output)
        if args.output
        else ROOT / "artifacts" / f"{piece.replace('/', '_')}.{fmt}"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    w = int(recipe["parameters"].get("width") or recipe["parameters"].get("output.width") or 1920)
    h = int(recipe["parameters"].get("height") or recipe["parameters"].get("output.height") or 1080)

    if piece == "flagship/latticefall":
        from numbrane_python.pieces.latticefall import build_world

        world = build_world(recipe)
        out = out.with_suffix(".json")
        out.write_text(json.dumps(world, indent=2))
        print(out)
        return 0

    if piece in GEOM_SVG_PIECES or piece in {
        "reference/circle-lattice",
        "geometry/circle-lattice",
    }:
        import math

        r = float(recipe.get("parameters", {}).get("geom.radius", 1.0))
        seed = int(args.seed)
        rot = ((seed % 360) * math.pi / 180.0) * 0.12
        levels = int(recipe.get("parameters", {}).get("geom.levels", 1))
        if "seed-of-life" in piece:
            centers = seed_of_life_centers(r * (0.9 + (seed % 11) / 55.0))
            c, s = math.cos(rot), math.sin(rot)
            centers = [(x * c - y * s, x * s + y * c) for x, y in centers]
            ir = geometry_ir_from_centers(centers, r)
            ir["meta"] = {"kind": "seed-of-life", "seed": seed}
        elif "metatron" in piece:
            centers = flower_of_life_centers(r, levels=max(1, levels + (seed % 2)))
            c, s = math.cos(rot), math.sin(rot)
            centers = [(x * c - y * s, x * s + y * c) for x, y in centers]
            ir = geometry_ir_from_centers(centers, r, edges=metatron_lines(centers))
            ir["meta"] = {"kind": "metatron", "seed": seed, "nodes": len(centers)}
        elif "flower-of-life" in piece or "sri-yantra" in piece or "isometric" in piece:
            from numbrane_python.geometry.sacred import build_sacred_geometry_ir

            kind = (
                "flower-of-life"
                if "flower" in piece
                else "sri-yantra"
                if "sri" in piece
                else "isometric"
            )
            ir = build_sacred_geometry_ir(
                kind,
                radius=r,
                layers=int(recipe.get("parameters", {}).get("geom.levels", 3)),
                scale=float(recipe.get("parameters", {}).get("geom.scale", 1.0)),
                seed=seed,
            )
        else:
            ir = gen_lattice(recipe)
            if isinstance(ir, dict):
                ir.setdefault("meta", {})["seed"] = seed
        if fmt == "svg":
            out = out.with_suffix(".svg")
            out.write_text(geometry_ir_to_svg(ir, width=w, height=h), encoding="utf-8")
        elif fmt == "json":
            out = out.with_suffix(".json")
            out.write_text(json.dumps(ir, indent=2))
        else:
            from numbrane_python.seeds.svg_export import geometry_ir_to_png

            out = out.with_suffix(".png")
            geometry_ir_to_png(ir, width=w, height=h).save(out)
            # Also keep SVG sibling for vector workflows
            out.with_suffix(".svg").write_text(
                geometry_ir_to_svg(ir, width=w, height=h), encoding="utf-8"
            )
        print(out)
        return 0

    if piece == "reaction-diffusion/reaction-diffusion":
        iters = frame if frame > 0 else int(recipe["parameters"].get("iterations", 600))
        iters = min(iters, 4000)
        u, v = simulate_reaction_diffusion(w, h, args.seed, iterations=iters)
        img = _preview_from_field(v)
        out = out.with_suffix(".png")
        _save_image(img, out)
        print(out)
        return 0

    if piece == "growth/slime-mold":
        steps = frame if frame > 0 else int(recipe["parameters"].get("steps", 300))
        steps = min(steps, 1200)
        _agents, trail = simulate_slime(w, h, args.seed, steps=steps)
        img = _preview_from_field(trail / max(float(trail.max()), 1e-6))
        out = out.with_suffix(".png")
        _save_image(img, out)
        print(out)
        return 0

    if piece in {"landscape/noise-landscape", "reference/noise-landscape"}:
        img = render_noise_landscape(recipe)
        out = out.with_suffix(".png")
        img.save(out)
        print(out)
        return 0

    if piece in {"fractals/escape-time", "reference/escape-time"}:
        from numbrane_python.pieces.escape_time import render_escape_time

        img = render_escape_time(recipe, width=w, height=h, frame=frame)
        out = out.with_suffix(".png")
        _save_image(img, out)
        print(out)
        return 0

    if piece in SKETCH_MAP:
        import importlib

        mod = importlib.import_module(f"numbrane_python.sketches.{SKETCH_MAP[piece]}")
        ctx, kwargs = recipe_to_render_context(recipe, frame=frame)
        config_cls = getattr(mod, next(n for n in dir(mod) if n.endswith("Config")), None)
        if config_cls is not None:
            fields = getattr(config_cls, "model_fields", None) or getattr(
                config_cls, "__fields__", {}
            )
            filtered = {k: v for k, v in kwargs.items() if k in fields}
            if frame > 0 and "iterations" in fields:
                filtered["iterations"] = frame
            if frame > 0 and "steps" in fields:
                filtered["steps"] = frame
            config = config_cls(**filtered)
        else:
            config = kwargs
        result = mod.render(config, ctx)
        image = getattr(result, "image", None)
        if image is None:
            image = getattr(result, "canvas", None)
        out = out.with_suffix(".png")
        if image is None and hasattr(result, "save"):
            result.save(out)
        else:
            _save_image(image, out)
        print(out)
        return 0

    if piece.startswith("audiovisual/"):
        print(
            f"Piece {piece} is web-engine hosted for interactive preview "
            "(Tone/nodes). Use `just dev-web` or LIVE audiovisual scenes.",
            file=sys.stderr,
        )
        return 0

    print(f"No python renderer wired for {piece}", file=sys.stderr)
    return 1


def cmd_seed_from_raster(args: argparse.Namespace) -> int:
    """Create a Seed Artifact by transforming a raster into mathematical state."""
    import numpy as np
    from PIL import Image

    from numbrane_python.seeds import (
        default_library_root,
        raster_to_displacement,
        raster_to_emission_density,
        raster_to_nutrient_map,
    )
    from numbrane_python.seeds.artifact import (
        ARTIFACT_VERSION,
        PROTOCOL_VERSION,
        SeedArtifact,
        StateFile,
        content_digest,
        save_artifact,
    )

    mode = args.transform
    piece = args.piece
    out = (
        Path(args.output)
        if args.output
        else default_library_root() / (f"raster-{mode}-{Path(args.image).stem}")
    )
    out.mkdir(parents=True, exist_ok=True)
    (out / "state").mkdir(parents=True, exist_ok=True)
    nutrient = raster_to_nutrient_map(args.image)
    h, w = nutrient.shape
    state_files: list[StateFile] = []
    artifact_type = "raster"
    if mode == "nutrient" or piece.startswith("reaction-diffusion"):
        u = np.ones_like(nutrient)
        v = nutrient.astype(np.float32)
        for name, arr in (("U", u), ("V", v)):
            rel = f"state/{name}.npy"
            np.save(out / rel, arr)
            state_files.append(
                StateFile(
                    role=name, path=rel, format="npy", dtype=str(arr.dtype), shape=list(arr.shape)
                )
            )
        artifact_type = "simulation-state"
        piece = "reaction-diffusion/reaction-diffusion"
    elif mode == "emission" or piece.startswith("particles"):
        dens = raster_to_emission_density(args.image)
        rel = "state/emission.npy"
        np.save(out / rel, dens)
        state_files.append(
            StateFile(
                role="emission",
                path=rel,
                format="npy",
                dtype=str(dens.dtype),
                shape=list(dens.shape),
            )
        )
        artifact_type = "scalar-field"
        piece = piece if piece.startswith("particles") else "particles/noodles"
    else:
        dx, dy = raster_to_displacement(args.image)
        for name, arr in (("dx", dx), ("dy", dy)):
            rel = f"state/{name}.npy"
            np.save(out / rel, arr)
            state_files.append(
                StateFile(
                    role=name, path=rel, format="npy", dtype=str(arr.dtype), shape=list(arr.shape)
                )
            )
        artifact_type = "vector-field"
        piece = piece if piece.startswith("fields") else "fields/flow-hatching"

    preview = "preview.png"
    Image.open(args.image).convert("RGB").resize((min(w, 1024), min(h, 1024))).save(out / preview)
    recipe = {
        "protocol_version": "0.1.0",
        "piece_id": piece,
        "seed": args.seed,
        "parameters": {"width": w, "height": h, "from_raster": args.image},
    }
    art = SeedArtifact(
        protocol_version=PROTOCOL_VERSION,
        artifact_version=ARTIFACT_VERSION,
        piece_id=piece,
        engine="python",
        seed=args.seed,
        artifact_type=artifact_type,
        content_digest="",
        frame=0,
        tick=0,
        width=w,
        height=h,
        recipe=recipe,
        state_files=state_files,
        preview={"png": preview},
        notes=f"raster transform={mode}",
    )
    art.content_digest = content_digest(art.to_manifest())
    save_artifact(art, out)
    print(art.root)
    print(f"digest={art.content_digest} type={art.artifact_type} transform={mode}")
    return 0


def cmd_seed_create(args: argparse.Namespace) -> int:
    from numbrane_python.seeds import create_seed_artifact, default_library_root

    recipe = _load_recipe(args)
    out = (
        Path(args.output)
        if args.output
        else default_library_root() / (f"{args.piece.replace('/', '-')}-s{args.seed}-f{args.frame}")
    )
    art = create_seed_artifact(
        args.piece,
        recipe,
        output=out,
        frame=args.frame,
        width=args.width,
        height=args.height,
    )
    print(art.root)
    print(f"digest={art.content_digest} type={art.artifact_type} frame={art.frame}")
    return 0


def cmd_seed_list(args: argparse.Namespace) -> int:
    from numbrane_python.seeds.artifact import default_library_root, list_artifacts, load_artifact

    root = Path(args.library) if args.library else default_library_root()
    arts = list_artifacts(root)
    if not arts:
        print(f"(empty) {root}")
        return 0
    for p in arts:
        a = load_artifact(p)
        print(f"{p.name:40} {a.piece_id:36} f={a.frame:<6} {a.artifact_type}")
    return 0


def cmd_seed_inspect(args: argparse.Namespace) -> int:
    from numbrane_python.seeds import load_artifact

    art = load_artifact(Path(args.artifact))
    print(json.dumps(art.to_manifest(), indent=2))
    return 0


def cmd_seed_render(args: argparse.Namespace) -> int:
    from numbrane_python.seeds import load_artifact
    from PIL import Image
    import shutil

    art = load_artifact(Path(args.artifact))
    assert art.root is not None
    out = Path(args.output) if args.output else Path("artifacts") / f"{art.root.name}-preview.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    prev = art.preview.get("png")
    if prev and (art.root / prev).exists():
        shutil.copy(art.root / prev, out)
        print(out)
        return 0
    if art.preview.get("svg"):
        # copy svg
        svg_out = out.with_suffix(".svg")
        shutil.copy(art.root / art.preview["svg"], svg_out)
        print(svg_out)
        return 0
    for sf in art.state_files:
        if sf.format == "npy" and sf.role == "raster":
            import numpy as np

            arr = np.load(art.root / sf.path)
            Image.fromarray(arr).save(out)
            print(out)
            return 0
    print("no preview available", file=sys.stderr)
    return 1


def cmd_seed_continue(args: argparse.Namespace) -> int:
    from numbrane_python.seeds import continue_seed_artifact

    art = continue_seed_artifact(
        Path(args.artifact),
        steps=args.steps,
        output=Path(args.output) if args.output else None,
    )
    print(art.root)
    print(f"digest={art.content_digest} frame={art.frame}")
    return 0


def cmd_explore(args: argparse.Namespace) -> int:
    """Deterministic seed variants for a piece (rule-based exploration)."""
    seeds = [int(s) for s in args.seeds.split(",")]
    out_dir = Path(args.output or ROOT / "artifacts" / "explore" / args.piece.replace("/", "_"))
    out_dir.mkdir(parents=True, exist_ok=True)
    for i, seed in enumerate(seeds):
        ns = argparse.Namespace(
            piece=args.piece,
            seed=seed,
            recipe=args.recipe,
            width=args.size,
            height=args.size,
            frame=args.frame,
            format="png",
            output=str(out_dir / f"var_{i:02d}_s{seed}.png"),
            quality="high",
        )
        if args.piece in GEOM_SVG_PIECES:
            ns.format = "svg"
            ns.output = str(out_dir / f"var_{i:02d}_s{seed}.svg")
        print(f"explore {args.piece} seed={seed}")
        cmd_render(ns)
    print(out_dir)
    return 0


def cmd_gallery(args: argparse.Namespace) -> int:
    seeds = [int(s) for s in args.seeds.split(",")]
    pieces = (
        args.pieces.split(",")
        if args.pieces
        else [
            "geometry/seed-of-life",
            "geometry/metatron",
            "reaction-diffusion/reaction-diffusion",
            "growth/slime-mold",
            "fractals/strange-attractors",
            "fields/flow-hatching",
            "tiling/truchet-tiles",
            "particles/noodles",
        ]
    )
    out_dir = Path(args.output or ROOT / "artifacts" / "gallery")
    out_dir.mkdir(parents=True, exist_ok=True)
    ns = argparse.Namespace(
        recipe=None,
        seed=42,
        width=args.size,
        height=args.size,
        frame=args.frame,
        format="png",
        output=None,
        piece=None,
    )
    for piece in pieces:
        for seed in seeds:
            ns.piece = piece
            ns.seed = seed
            ns.output = str(out_dir / f"{piece.replace('/', '_')}_s{seed}.png")
            # geometry prefers svg+json
            if piece in GEOM_SVG_PIECES:
                ns.format = "svg"
                ns.output = str(out_dir / f"{piece.replace('/', '_')}_s{seed}.svg")
            else:
                ns.format = "png"
            print(f"gallery {piece} seed={seed}")
            cmd_render(ns)
    print(out_dir)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="numbrane")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("pieces", help="List pieces")
    p.set_defaults(func=cmd_pieces)

    p = sub.add_parser("inspect", help="Inspect a piece manifest")
    p.add_argument("piece")
    p.set_defaults(func=cmd_inspect)

    p = sub.add_parser("render", help="Render a deterministic still")
    p.add_argument("piece")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--recipe")
    p.add_argument("--output", "-o")
    p.add_argument("--frame", type=int, default=0)
    p.add_argument("--width", type=int)
    p.add_argument("--height", type=int)
    p.add_argument("--format", choices=["png", "svg", "json"], default="png")
    p.add_argument("--quality", default="high")
    p.set_defaults(func=cmd_render)

    seed = sub.add_parser("seed", help="Seed Artifact commands")
    seed_sub = seed.add_subparsers(dest="seed_cmd", required=True)

    p = seed_sub.add_parser("create", help="Create a Seed Artifact")
    p.add_argument("piece")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--recipe")
    p.add_argument("--frame", type=int, default=0)
    p.add_argument("--width", type=int, default=512)
    p.add_argument("--height", type=int, default=512)
    p.add_argument("--output", "-o")
    p.set_defaults(func=cmd_seed_create)

    p = seed_sub.add_parser("list", help="List Seed Artifacts in library")
    p.add_argument("--library")
    p.set_defaults(func=cmd_seed_list)

    p = seed_sub.add_parser("inspect", help="Inspect a Seed Artifact")
    p.add_argument("artifact")
    p.set_defaults(func=cmd_seed_inspect)

    p = seed_sub.add_parser("render", help="Export Seed Artifact preview")
    p.add_argument("artifact")
    p.add_argument("--output", "-o")
    p.set_defaults(func=cmd_seed_render)

    p = seed_sub.add_parser("continue", help="Advance a structured Seed Artifact")
    p.add_argument("artifact")
    p.add_argument("--steps", type=int, default=100)
    p.add_argument("--output", "-o")
    p.set_defaults(func=cmd_seed_continue)

    p = seed_sub.add_parser(
        "from-raster",
        help="Build Seed Artifact from image (nutrient/emission/displacement)",
    )
    p.add_argument("image")
    p.add_argument(
        "--transform", choices=["nutrient", "emission", "displacement"], default="nutrient"
    )
    p.add_argument("--piece", default="reaction-diffusion/reaction-diffusion")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--output", "-o")
    p.set_defaults(func=cmd_seed_from_raster)

    p = sub.add_parser("explore", help="Deterministic seed variants for a piece")
    p.add_argument("piece")
    p.add_argument("--seeds", default="1,42,137,2026,999")
    p.add_argument("--size", type=int, default=384)
    p.add_argument("--frame", type=int, default=200)
    p.add_argument("--recipe")
    p.add_argument("--output", "-o")
    p.set_defaults(func=cmd_explore)

    p = sub.add_parser("gallery", help="Render a piece×seed contact sheet folder")
    p.add_argument("--seeds", default="1,42,137,2026")
    p.add_argument("--pieces", default="")
    p.add_argument("--size", type=int, default=384)
    p.add_argument("--frame", type=int, default=200)
    p.add_argument("--output", "-o")
    p.set_defaults(func=cmd_gallery)

    p = sub.add_parser("sweep", help="Parameter seed sweep (gallery alias)")
    p.add_argument("piece")
    p.add_argument("--seeds", default="1,42,137,2026")
    p.add_argument("--size", type=int, default=384)
    p.add_argument("--frame", type=int, default=200)
    p.add_argument("--output", "-o")

    def cmd_sweep(a: argparse.Namespace) -> int:
        a.pieces = a.piece
        return cmd_gallery(a)

    p.set_defaults(func=cmd_sweep)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
