"""Evolve command implementation."""

import json
from pathlib import Path
from typing import Optional

import numpy as np
import typer

from numbrane_python.cli.utils import (
    create_progress,
    get_console,
    print_error,
    print_info,
    print_success,
)
from numbrane_python.core.config import Quality, load_config
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.registry import get_registry
from numbrane_python.core.rng import RNG
from numbrane_python.paramspace.constraint import ConstraintMode
from numbrane_python.paramspace.mutator import (
    CompositeMutator,
    GaussianJitterMutator,
    RandomResetMutator,
)
from numbrane_python.paramspace.sampler import LatinHypercubeSampler, RandomSampler

evolve_app = typer.Typer(name="evolve", help="Evolutionary parameter search")


def compute_fitness(image: np.ndarray) -> float:
    """Compute fitness score for an image.

    Simple heuristic: edge density + entropy + contrast.

    Args:
        image: Image array (H, W, 3) uint8

    Returns:
        Fitness score (higher is better)
    """
    from scipy import ndimage

    # Convert to grayscale
    gray = np.mean(image, axis=2).astype(np.float32)

    # Edge density (Sobel)
    sobel_x = ndimage.sobel(gray, axis=1)
    sobel_y = ndimage.sobel(gray, axis=0)
    edge_magnitude = np.sqrt(sobel_x**2 + sobel_y**2)
    edge_density = np.mean(edge_magnitude) / 255.0

    # Entropy (histogram-based)
    hist, _ = np.histogram(gray.flatten(), bins=256, range=(0, 256))
    hist = hist / hist.sum()
    hist = hist[hist > 0]
    entropy = -np.sum(hist * np.log2(hist))
    entropy_norm = entropy / 8.0  # Normalize to [0, 1]

    # Contrast (std of pixel values)
    contrast = np.std(gray) / 255.0

    # Combined fitness
    fitness = edge_density * 0.4 + entropy_norm * 0.3 + contrast * 0.3
    return float(fitness)


@evolve_app.command()
def evolve(
    sketch: str = typer.Argument(..., help="Sketch name"),
    population: int = typer.Option(20, "--population", "-p", help="Population size"),
    generations: int = typer.Option(10, "--generations", "-g", help="Number of generations"),
    seed: int = typer.Option(42, "--seed", "-s", help="Random seed"),
    out: Path = typer.Option(None, "--out", "-o", help="Output directory"),
    selection: str = typer.Option("auto", "--selection", help="Selection mode (auto, manual)"),
    mutation_rate: float = typer.Option(0.1, "--mutation-rate", help="Mutation rate"),
    elite_size: int = typer.Option(2, "--elite", help="Elite size (keep best N)"),
    sketch_path: Path | None = typer.Option(
        None, "--sketch-path", help="Additional sketch directory"
    ),
):
    """Evolve parameters using genetic algorithm."""
    console = get_console()

    registry = get_registry()
    registry.discover_builtin()
    if sketch_path:
        registry.discover_path(sketch_path)

    sketch_info = registry.get(sketch)
    if not sketch_info:
        print_error(f"Sketch '{sketch}' not found.")
        raise typer.Exit(1)

    if not sketch_info.param_space_func:
        print_error(f"Sketch '{sketch}' does not expose a parameter space.")
        raise typer.Exit(1)

    param_space = sketch_info.param_space_func()

    # Determine output
    if out is None:
        out = Path.cwd() / "out" / sketch / "evolve"
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)

    # Initialize population
    console.print(f"[bold]Initializing population of {population}...[/bold]")
    sampler = LatinHypercubeSampler()
    initial_samples = sampler.sample(param_space, population, seed, None, ConstraintMode.REJECT)

    # Create mutator
    mutator = CompositeMutator(
        [
            GaussianJitterMutator(),
            RandomResetMutator(),
        ]
    )

    # Evolution loop
    rng_base = np.random.default_rng(seed)
    current_population = initial_samples
    selection_history = []

    for generation in range(generations):
        console.print(f"\n[bold]Generation {generation + 1}/{generations}[/bold]")

        # Evaluate fitness
        fitness_scores = []
        generation_dir = out / f"gen_{generation:03d}"
        generation_dir.mkdir(exist_ok=True)

        with create_progress() as progress:
            task = progress.add_task("Evaluating...", total=len(current_population))

            for i, (config_dict, provenance) in enumerate(current_population):
                # Create config object
                config_obj = sketch_info.config_class(**config_dict)
                config_obj.seed = seed + generation * 1000 + i

                # Render
                rng = RNG(config_obj.seed)
                quality = Quality(mode="preview", supersample=1)
                ctx = RenderContext(
                    rng=rng,
                    width=config_obj.width,
                    height=config_obj.height,
                    quality=quality,
                    output_dir=generation_dir,
                )

                result = sketch_info.render_func(config_obj, ctx)

                # Compute fitness
                fitness = compute_fitness(result.image)
                fitness_scores.append((i, fitness, config_dict, provenance))

                # Save
                output_path = generation_dir / f"individual_{i:03d}_fitness_{fitness:.3f}.png"
                result.save(output_path)

                progress.update(task, advance=1)

        # Sort by fitness
        fitness_scores.sort(key=lambda x: x[1], reverse=True)

        # Save generation summary
        gen_summary = {
            "generation": generation,
            "population": population,
            "individuals": [
                {
                    "index": idx,
                    "fitness": float(fitness),
                    "config": config,
                    "provenance": prov,
                }
                for idx, fitness, config, prov in fitness_scores
            ],
        }

        with open(generation_dir / "summary.json", "w") as f:
            json.dump(gen_summary, f, indent=2)

        console.print(f"  Best fitness: {fitness_scores[0][1]:.3f}")
        console.print(f"  Worst fitness: {fitness_scores[-1][1]:.3f}")

        # Selection
        if selection == "manual":
            # Human-in-the-loop (simplified - would need interactive prompt)
            console.print(
                "[yellow]Manual selection not yet implemented. Using auto selection.[/yellow]"
            )
            selection = "auto"

        # Auto selection: keep elite + select rest
        elite = fitness_scores[:elite_size]
        selected = elite.copy()

        # Tournament selection for rest
        tournament_size = 3
        rng_gen = np.random.default_rng(seed + generation)
        while len(selected) < population:
            # Tournament
            tournament = rng_gen.choice(len(fitness_scores), size=tournament_size, replace=False)
            tournament_scores = [fitness_scores[i] for i in tournament]
            winner = max(tournament_scores, key=lambda x: x[1])
            selected.append(winner)

        selection_history.append(
            {
                "generation": generation,
                "selected_indices": [s[0] for s in selected],
            }
        )

        # Create next generation
        if generation < generations - 1:
            next_population = []

            # Keep elite
            for elite_item in elite:
                next_population.append((elite_item[2], elite_item[3]))

            # Mutate and crossover for rest
            while len(next_population) < population:
                # Select parent
                parent_idx = rng_gen.choice(len(selected))
                parent_config, parent_prov = selected[parent_idx][2], selected[parent_idx][3]

                # Mutate
                rng_mutate = np.random.default_rng(seed + generation * 1000 + len(next_population))
                mutated_config = mutator.mutate(
                    param_space, parent_config, rng_mutate, mutation_rate
                )

                # Validate
                is_valid, errors = param_space.validate(mutated_config)
                if is_valid:
                    mutated_prov = parent_prov.copy()
                    mutated_prov["_mutated"] = True
                    mutated_prov["_parent"] = parent_idx
                    next_population.append((mutated_config, mutated_prov))
                else:
                    # Re-sample if invalid
                    rng_resample = np.random.default_rng(
                        seed + generation * 2000 + len(next_population)
                    )
                    new_config, new_prov = param_space.sample(
                        rng_resample, None, ConstraintMode.REJECT
                    )
                    next_population.append((new_config, new_prov))

            current_population = next_population

    # Save evolution history
    history = {
        "sketch": sketch,
        "seed": seed,
        "population": population,
        "generations": generations,
        "selection_history": selection_history,
    }

    with open(out / "evolution_history.json", "w") as f:
        json.dump(history, f, indent=2)

    # Generate HTML summary
    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Evolution Summary: {sketch}</title>
    <style>
        body {{ font-family: sans-serif; background: #1a1a1a; color: #fff; padding: 20px; }}
        .generation {{ margin: 20px 0; padding: 15px; background: #2a2a2a; border-radius: 8px; }}
        .individual {{ display: inline-block; margin: 10px; text-align: center; }}
        .individual img {{ width: 150px; height: auto; border-radius: 4px; }}
        .fitness {{ color: #0f0; font-weight: bold; }}
    </style>
</head>
<body>
    <h1>Evolution Summary: {sketch}</h1>
    <p>Population: {population}, Generations: {generations}, Seed: {seed}</p>
"""

    for generation in range(generations):
        gen_dir = out / f"gen_{generation:03d}"
        summary_path = gen_dir / "summary.json"
        if summary_path.exists():
            with open(summary_path) as f:
                gen_summary = json.load(f)

            html += f'<div class="generation"><h2>Generation {generation}</h2>'
            for ind in gen_summary["individuals"][:10]:  # Show top 10
                img_path = (
                    gen_dir / f"individual_{ind['index']:03d}_fitness_{ind['fitness']:.3f}.png"
                )
                rel_path = img_path.relative_to(out)
                html += f'''
                <div class="individual">
                    <img src="{rel_path}" alt="Individual {ind["index"]}">
                    <div class="fitness">Fitness: {ind["fitness"]:.3f}</div>
                </div>
                '''
            html += "</div>"

    html += "</body></html>"

    with open(out / "summary.html", "w") as f:
        f.write(html)

    print_success(f"Evolution complete. Results in {out}")
    console.print(f"[dim]Summary: {out / 'summary.html'}[/dim]")
