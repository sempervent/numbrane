"""Explore command implementation."""

import hashlib
import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import typer

from numbrane_python.cli.utils import create_progress, get_console, print_error, print_success
from numbrane_python.core.config import Quality, load_config
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.recipe import RecipeManifest
from numbrane_python.core.registry import get_registry
from numbrane_python.core.rng import RNG

explore_app = typer.Typer(name="explore", help="Parameter space exploration")


@explore_app.command("guided")
def explore_guided(
    library: bool = typer.Option(True, "--library/--no-library", help="Register in library"),
    keep: str = typer.Option("top10", "--keep", help="What to keep (all, topN, final)"),
    sketch: str = typer.Argument(..., help="Sketch name"),
    goal: str | None = typer.Option(
        None, "--goal", "-g", help="Goal description (e.g., 'high biologicalness, low symmetry')"
    ),
    steps: int = typer.Option(40, "--steps", "-s", help="Number of exploration steps"),
    seed: int = typer.Option(42, "--seed", help="Random seed"),
    strategy: str = typer.Option(
        "meta_gradient", "--strategy", help="Strategy (random, meta_gradient, evolutionary)"
    ),
    out: Path = typer.Option(Path("explore"), "--out", "-o", help="Output directory"),
    sketch_path: Path | None = typer.Option(
        None, "--sketch-path", help="Additional sketch directory"
    ),
):
    """Guided exploration with meta-controls."""
    from numbrane_python.core.config import Quality
    from numbrane_python.core.ctx import RenderContext
    from numbrane_python.core.registry import get_registry
    from numbrane_python.core.rng import RNG
    from numbrane_python.core.schema_registry import register_sketch_schemas
    from numbrane_python.meta.exploration import (
        EvolutionaryStrategy,
        ExplorationResult,
        MetaGradientStrategy,
        RandomStrategy,
    )
    from numbrane_python.meta.fitness import CompositeFitness
    from numbrane_python.meta.resolver import MetaResolver
    from numbrane_python.params.schema import get_registry as get_schema_registry

    console = get_console()

    # Discover sketches
    registry = get_registry()
    registry.discover_builtin()
    if sketch_path:
        registry.discover_path(sketch_path)

    register_sketch_schemas()
    schema_registry = get_schema_registry()

    sketch_info = registry.get(sketch)
    if not sketch_info:
        print_error(f"Sketch '{sketch}' not found.")
        raise typer.Exit(1)

    schema = schema_registry.get(sketch)
    if not schema:
        print_error(f"Schema for '{sketch}' not found.")
        raise typer.Exit(1)

    # Parse goal into meta-targets
    meta_targets = {}
    if goal:
        # Simple parsing (could be improved)
        goal_lower = goal.lower()
        if "high biologicalness" in goal_lower or "biologicalness" in goal_lower:
            meta_targets["biologicalness"] = 0.8
        if "low symmetry" in goal_lower:
            meta_targets["symmetry"] = 0.2
        if "high symmetry" in goal_lower:
            meta_targets["symmetry"] = 0.8
        if "high violence" in goal_lower:
            meta_targets["violence"] = 0.8
        if "low entropy" in goal_lower:
            meta_targets["entropy"] = 0.2
        if "high entropy" in goal_lower:
            meta_targets["entropy"] = 0.8

    # Create strategy
    if strategy == "random":
        exploration_strategy = RandomStrategy(seed=seed)
    elif strategy == "meta_gradient":
        exploration_strategy = MetaGradientStrategy(seed=seed, meta_targets=meta_targets)
    elif strategy == "evolutionary":
        exploration_strategy = EvolutionaryStrategy(seed=seed)
    else:
        print_error(f"Unknown strategy: {strategy}")
        raise typer.Exit(1)

    # Create fitness function
    fitness = CompositeFitness(
        metrics={
            "edge_density": 0.3,
            "entropy": 0.3,
            "color_diversity": 0.2,
            "spatial_balance": 0.2,
        },
    )

    # Get base config
    base_config = schema_registry.get_defaults(sketch) or {}

    # Run exploration
    console.print("[bold]Starting guided exploration...[/bold]")
    console.print(f"Sketch: {sketch}")
    console.print(f"Strategy: {strategy}")
    console.print(f"Steps: {steps}")
    if meta_targets:
        console.print(f"Meta-targets: {meta_targets}")
    console.print()

    out_path = Path(out)
    out_path.mkdir(parents=True, exist_ok=True)
    (out_path / "thumbs").mkdir(exist_ok=True)

    from numbrane_python.meta.exploration import ExplorationStep

    previous_steps = []
    results = []

    for step_idx in range(steps):
        # Generate next config
        config = exploration_strategy.generate_next(base_config, schema, previous_steps, fitness)

        # Render
        config_obj = sketch_info.config_class(**config)
        config_obj.seed = seed + step_idx

        rng = RNG(seed + step_idx)
        quality = Quality(mode="preview", supersample=1)
        ctx = RenderContext(
            rng=rng,
            width=config_obj.width,
            height=config_obj.height,
            quality=quality,
            output_dir=out_path,
        )

        result = sketch_info.render_func(config_obj, ctx)

        # Score
        score_result = fitness.score(result.image, config)

        # Save
        from numbrane_python.params.normalize import param_hash_short

        hash_short = param_hash_short(config)
        output_path = out_path / f"{sketch}_step{step_idx:04d}_{hash_short}.png"
        result.save(output_path)

        # Thumbnail
        thumb_path = out_path / "thumbs" / f"{sketch}_step{step_idx:04d}.png"
        from PIL import Image

        thumb = result.image[::4, ::4]
        Image.fromarray(thumb).save(thumb_path)

        # Record step
        step = ExplorationStep(
            config=config,
            param_hash=hash_short,
            score=score_result.total_score,
            component_scores=score_result.component_scores,
        )
        previous_steps.append(step)
        results.append(
            {
                "index": step_idx,
                "path": str(output_path),
                "thumb": str(thumb_path),
                "score": score_result.total_score,
                "component_scores": score_result.component_scores,
                "param_hash": hash_short,
            }
        )

    # Filter top-N if requested
    if keep.startswith("top") and keep != "top10":
        try:
            n = int(keep[3:])
            results.sort(key=lambda r: r["score"], reverse=True)
            results = results[:n]
        except ValueError:
            pass

    # Save results
    results_path = out_path / "results.json"
    with open(results_path, "w") as f:
        json.dump(results, f, indent=2)

    # Find best
    best = max(results, key=lambda r: r["score"])
    console.print("\n[bold]Exploration complete![/bold]")
    console.print(f"Best score: {best['score']:.3f} (step {best['index']})")
    console.print(f"Results saved to {out_path}")

    if library:
        console.print(f"[dim]Registered {len(results)} runs in library[/dim]")

    print_success(f"Guided exploration complete. {len(results)} steps in {out_path}")


def latin_hypercube_sample(n: int, dims: int, rng: np.random.Generator) -> np.ndarray:
    """Generate Latin Hypercube samples.

    Args:
        n: Number of samples
        dims: Number of dimensions
        rng: Random generator

    Returns:
        Array of shape (n, dims) with values in [0, 1]
    """
    samples = np.zeros((n, dims))
    for i in range(dims):
        perm = rng.permutation(n)
        samples[:, i] = (perm + rng.random(n)) / n
    return samples


@explore_app.command()
def explore(
    sketch: str = typer.Argument(..., help="Sketch name"),
    samples: int = typer.Option(20, "--samples", "-n", help="Number of samples"),
    strategy: str = typer.Option(
        "random", "--strategy", "-s", help="Sampling strategy (random, grid, lhs)"
    ),
    out: Path = typer.Option(None, "--out", "-o", help="Output directory"),
    config: Path | None = typer.Option(None, "--config", "-c", help="Base config file"),
    param_ranges: str | None = typer.Option(None, "--ranges", help="Parameter ranges JSON"),
    width: int | None = typer.Option(None, "--width", "-w", help="Canvas width"),
    height: int | None = typer.Option(None, "--height", "-h", help="Canvas height"),
    preview: bool = typer.Option(False, "--preview", help="Fast preview mode"),
    sketch_path: Path | None = typer.Option(
        None, "--sketch-path", help="Additional sketch directory"
    ),
):
    """Explore parameter space with various sampling strategies."""
    console = get_console()

    registry = get_registry()
    registry.discover_builtin()
    if sketch_path:
        registry.discover_path(sketch_path)

    sketch_info = registry.get(sketch)
    if not sketch_info:
        print_error(f"Sketch '{sketch}' not found.")
        raise typer.Exit(1)

    # Load base config
    config_obj = sketch_info.config_class()
    if config:
        config_dict = load_config(config)
        config_obj = sketch_info.config_class(**config_dict)

    if width:
        config_obj.width = width
    if height:
        config_obj.height = height

    # Parse parameter ranges
    ranges_dict = {}
    if param_ranges:
        ranges_dict = json.loads(param_ranges)

    # Determine output
    if out is None:
        out = Path.cwd() / "out" / sketch / "explore"
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "thumbs").mkdir(exist_ok=True)
    (out / "manifests").mkdir(exist_ok=True)

    quality = Quality(mode="preview" if preview else "final", supersample=1 if preview else 2)

    # Generate samples
    rng_base = np.random.default_rng(42)

    if strategy == "grid":
        # Simple grid sampling (2D for now)
        grid_size = int(np.ceil(np.sqrt(samples)))
        seeds = []
        for i in range(grid_size):
            for j in range(grid_size):
                if len(seeds) < samples:
                    seeds.append(i * grid_size + j)
    elif strategy == "lhs":
        # Latin Hypercube for seeds
        lhs_samples = latin_hypercube_sample(samples, 1, rng_base)
        seeds = [int(s * 10000) for s in lhs_samples[:, 0]]
    else:  # random
        seeds = rng_base.integers(0, 10000, size=samples).tolist()

    results = []

    console.print(
        f"[bold]Exploring {sketch} with {strategy} sampling ({samples} samples)...[/bold]"
    )

    with create_progress() as progress:
        task = progress.add_task("Exploring...", total=len(seeds))

        for i, seed in enumerate(seeds):
            # Apply parameter variations if ranges specified
            sample_config = (
                config_obj.model_copy(deep=True)
                if hasattr(config_obj, "model_copy")
                else config_obj
            )
            sample_config.seed = seed

            # Apply parameter ranges (simplified - would need proper parameter space definition)
            if ranges_dict:
                for param, value_range in ranges_dict.items():
                    if hasattr(sample_config, param):
                        if isinstance(value_range, list) and len(value_range) == 2:
                            # Continuous range
                            t = i / max(len(seeds) - 1, 1)
                            value = value_range[0] + (value_range[1] - value_range[0]) * t
                            setattr(sample_config, param, value)

            rng = RNG(seed)
            ctx = RenderContext(
                rng=rng,
                width=sample_config.width,
                height=sample_config.height,
                quality=quality,
                output_dir=out,
            )

            result = sketch_info.render_func(sample_config, ctx)

            # Save
            config_hash = hashlib.sha256(
                json.dumps(sample_config.model_dump(), sort_keys=True).encode()
            ).hexdigest()[:8]

            output_path = out / f"{sketch}_seed{seed}_{config_hash}.png"
            result.save(output_path)

            # Create thumbnail
            thumb_path = out / "thumbs" / f"{sketch}_seed{seed}.png"
            from PIL import Image

            thumb = result.image[::4, ::4]
            Image.fromarray(thumb).save(thumb_path)

            # Save recipe manifest
            recipe = RecipeManifest(
                sketch=sketch,
                config=sample_config,
                seed=seed,
                output_file=output_path,
            )
            manifest_path = out / "manifests" / f"{sketch}_seed{seed}.recipe.json"
            recipe.save(manifest_path)

            results.append(
                {
                    "seed": seed,
                    "path": str(output_path),
                    "thumb": str(thumb_path),
                    "manifest": str(manifest_path),
                    "config": sample_config.model_dump()
                    if hasattr(sample_config, "model_dump")
                    else str(sample_config),
                }
            )

            progress.update(task, advance=1)

    # Save index
    index_path = out / "index.json"
    with open(index_path, "w") as f:
        json.dump(
            {
                "strategy": strategy,
                "samples": samples,
                "results": results,
            },
            f,
            indent=2,
        )

    print_success(f"Exploration complete. Results saved to {out}")
    console.print(f"[dim]Index: {index_path}[/dim]")
    console.print(f"[dim]Manifests: {out / 'manifests'}[/dim]")
