"""Sweep command implementation."""

import csv
import json
from pathlib import Path
from typing import Optional

import typer

from numbrane_python.cli.utils import create_progress, get_console, print_error, print_success
from numbrane_python.core.config import Quality, load_config
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.registry import get_registry
from numbrane_python.core.schema_registry import register_sketch_schemas
from numbrane_python.params.schema import get_registry as get_schema_registry
from numbrane_python.core.rng import RNG
from numbrane_python.paramspace.constraint import ConstraintMode
from numbrane_python.paramspace.sampler import (
    GridSampler,
    LatinHypercubeSampler,
    RandomSampler,
    SobolSampler,
)

sweep_app = typer.Typer(name="sweep", help="Batch render with seed ranges")


@sweep_app.command("hyper")
def sweep_hyper(
    sketch: str = typer.Argument(..., help="Sketch name"),
    n: int = typer.Option(200, "--n", "-n", help="Number of samples"),
    seed: int = typer.Option(42, "--seed", "-s", help="Random seed"),
    out: Path = typer.Option(None, "--out", "-o", help="Output directory"),
    sketch_path: Path | None = typer.Option(
        None, "--sketch-path", help="Additional sketch directory"
    ),
):
    """Latin hypercube sweep across key parameters."""
    from numbrane_python.params.constraint import ConstraintMode
    from numbrane_python.params.sampler import LatinHypercubeSampler

    console = get_console()

    registry = get_registry()
    registry.discover_builtin()
    if sketch_path:
        registry.discover_path(sketch_path)

    # Register schemas
    register_sketch_schemas()

    sketch_info = registry.get(sketch)
    if not sketch_info:
        print_error(f"Sketch '{sketch}' not found.")
        raise typer.Exit(1)

    # Get schema
    schema_registry = get_schema_registry()
    schema = schema_registry.get(sketch)

    if schema:
        sampler = LatinHypercubeSampler()
        samples = sampler.sample(schema, n, seed, None)
    elif sketch_info.param_space_func:
        # Fall back to old param_space
        param_space = sketch_info.param_space_func()
        from numbrane_python.paramspace.constraint import ConstraintMode
        from numbrane_python.paramspace.sampler import LatinHypercubeSampler as OldLHS

        old_sampler = OldLHS()
        samples = old_sampler.sample(param_space, n, seed, None, ConstraintMode.REJECT)

        # Determine output
        if out is None:
            out = Path.cwd() / "out" / sketch / "hyper"
        out = Path(out)
        out.mkdir(parents=True, exist_ok=True)
        (out / "thumbs").mkdir(exist_ok=True)

        console.print(f"[bold]Rendering {len(samples)} hypercube samples...[/bold]")

        # Render each sample
        results = []
        for i, (config_dict, provenance) in enumerate(samples):
            config_obj = sketch_info.config_class(**config_dict)
            config_obj.seed = seed + i

            rng = RNG(seed + i)
            quality = Quality(mode="preview", supersample=1)
            ctx = RenderContext(
                rng=rng,
                width=config_obj.width,
                height=config_obj.height,
                quality=quality,
                output_dir=out,
            )

            result = sketch_info.render_func(config_obj, ctx)

            # Save
            from numbrane_python.params.normalize import param_hash_short

            hash_short = param_hash_short(config_dict)
            output_path = out / f"{sketch}_hyper{i:04d}_{hash_short}.png"
            result.save(output_path)

            # Thumbnail
            thumb_path = out / "thumbs" / f"{sketch}_hyper{i:04d}.png"
            from PIL import Image

            thumb = result.image[::4, ::4]
            Image.fromarray(thumb).save(thumb_path)

            result_dict = {
                "index": i,
                "path": str(output_path),
                "thumb": str(thumb_path),
            }
            if provenance:
                result_dict["provenance"] = provenance
            results.append(result_dict)

        # Save index
        index_path = out / "index.json"
        with open(index_path, "w") as f:
            json.dump(results, f, indent=2)

        print_success(f"Hypercube sweep complete. Results in {out}")
    else:
        print_error(f"Sketch '{sketch}' does not expose a parameter space.")
        raise typer.Exit(1)


@sweep_app.command()
def sweep(
    sketch: str = typer.Argument(..., help="Sketch name"),
    seeds: str = typer.Option(
        "0:10", "--seeds", help="Seed range (start:end) or use --sampler for param space"
    ),
    out: Path = typer.Option(None, "--out", "-o", help="Output directory"),
    config: Path | None = typer.Option(None, "--config", "-c", help="Config file"),
    width: int | None = typer.Option(None, "--width", "-w", help="Canvas width"),
    height: int | None = typer.Option(None, "--height", "-h", help="Canvas height"),
    preview: bool = typer.Option(False, "--preview", help="Fast preview mode"),
    sampler: str | None = typer.Option(
        None, "--sampler", help="Use param space sampler (random, grid, lhs, sobol)"
    ),
    constraints: str = typer.Option(
        "reject", "--constraints", help="Constraint mode (reject, repair, warn)"
    ),
    sketch_path: Path | None = typer.Option(
        None, "--sketch-path", help="Additional sketch directory"
    ),
):
    """Batch render with parameter sweeps."""
    console = get_console()

    registry = get_registry()
    registry.discover_builtin()
    if sketch_path:
        registry.discover_path(sketch_path)

    sketch_info = registry.get(sketch)
    if not sketch_info:
        print_error(f"Sketch '{sketch}' not found.")
        raise typer.Exit(1)

    # Use param space sampler if available and requested
    if sampler and sketch_info.param_space_func:
        param_space = sketch_info.param_space_func()
        sampler_map = {
            "random": RandomSampler(),
            "grid": GridSampler(),
            "lhs": LatinHypercubeSampler(),
            "sobol": SobolSampler(),
        }
        if sampler not in sampler_map:
            print_error(f"Unknown sampler: {sampler}")
            raise typer.Exit(1)

        try:
            constraint_mode = ConstraintMode(constraints)
        except ValueError:
            print_error(f"Unknown constraint mode: {constraints}")
            raise typer.Exit(1)

        # Parse seed range for number of samples
        try:
            seed_start, seed_end = map(int, seeds.split(":"))
            n_samples = seed_end - seed_start + 1
            master_seed = seed_start
        except ValueError:
            n_samples = 10
            master_seed = 42

        samples = sampler_map[sampler].sample(
            param_space, n_samples, master_seed, None, constraint_mode
        )
        seed_list = [master_seed + i for i in range(len(samples))]
        use_param_space = True
    else:
        # Traditional seed-based sweep
        try:
            seed_start, seed_end = map(int, seeds.split(":"))
            seed_list = list(range(seed_start, seed_end + 1))
        except ValueError:
            print_error(f"Invalid seed range: {seeds}. Use format 'start:end'")
            raise typer.Exit(1)
        use_param_space = False
        samples = None

    # Determine output
    if out is None:
        out = Path.cwd() / "out" / sketch / "sweep"
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "thumbs").mkdir(exist_ok=True)

    # Load config
    config_obj = sketch_info.config_class()
    if config:
        config_dict = load_config(config)
        config_obj = sketch_info.config_class(**config_dict)

    if width:
        config_obj.width = width
    if height:
        config_obj.height = height

    quality = Quality(mode="preview" if preview else "final", supersample=1 if preview else 2)

    results = []

    console.print(f"[bold]Rendering {len(seed_list)} variations...[/bold]")

    with create_progress() as progress:
        task = progress.add_task("Rendering...", total=len(seed_list))

        for i, seed in enumerate(seed_list):
            config_obj.seed = seed

            rng = RNG(seed)
            ctx = RenderContext(
                rng=rng,
                width=config_obj.width,
                height=config_obj.height,
                quality=quality,
                output_dir=out,
            )

            result = sketch_info.render_func(config_obj, ctx)

            # Save
            output_path = out / f"{sketch}_seed{seed}.png"
            result.save(output_path)

            # Create thumbnail
            thumb_path = out / "thumbs" / f"{sketch}_seed{seed}.png"
            from PIL import Image

            thumb = result.image[::4, ::4]
            Image.fromarray(thumb).save(thumb_path)

            results.append(
                {
                    "seed": seed,
                    "path": str(output_path),
                    "thumb": str(thumb_path),
                    "config": config_obj.model_dump()
                    if hasattr(config_obj, "model_dump")
                    else str(config_obj),
                }
            )

            progress.update(task, advance=1)

    # Save index
    index_path = out / "index.json"
    with open(index_path, "w") as f:
        json.dump(results, f, indent=2)

    csv_path = out / "index.csv"
    if results:
        with open(csv_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["seed", "path", "thumb"])
            writer.writeheader()
            for r in results:
                writer.writerow({"seed": r["seed"], "path": r["path"], "thumb": r["thumb"]})

    print_success(f"Completed. Results saved to {out}")
    console.print(f"[dim]Index: {index_path}[/dim]")
