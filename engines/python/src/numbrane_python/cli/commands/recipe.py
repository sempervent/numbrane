"""Recipe command implementation."""

import hashlib
from pathlib import Path
from typing import Optional

import typer

from numbrane_python.cli.utils import get_console, print_error, print_info, print_success
from numbrane_python.core.config import Quality
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.recipe import RecipeManifest
from numbrane_python.core.registry import get_registry
from numbrane_python.core.rng import RNG

recipe_app = typer.Typer(name="recipe", help="Recipe manifests for reproducibility")


@recipe_app.command("export")
def recipe_export(
    output_file: Path = typer.Argument(..., help="Output image file"),
    manifest: Path | None = typer.Option(None, "--manifest", "-m", help="Manifest output path"),
):
    """Export recipe manifest from an output file."""
    output_path = Path(output_file)
    if not output_path.exists():
        print_error(f"Output file {output_path} not found.")
        raise typer.Exit(1)

    # Try to find associated metadata
    metadata_path = output_path.with_suffix(".json")
    if not metadata_path.exists():
        print_error(f"Metadata file {metadata_path} not found. Cannot export recipe.")
        raise typer.Exit(1)

    import json

    with open(metadata_path) as f:
        metadata = json.load(f)

    # Reconstruct config (simplified - would need sketch registry)
    console = get_console()
    console.print(
        "[yellow]Note: Recipe export requires full context. Use 'numbrane render' to generate manifests automatically.[/yellow]"
    )

    if manifest:
        manifest_path = Path(manifest)
    else:
        manifest_path = output_path.with_suffix(".recipe.json")

    # Create basic manifest
    recipe = RecipeManifest(
        sketch=metadata.get("sketch", "unknown"),
        config=None,  # Would need to reconstruct
        seed=metadata.get("seed", 0),
        output_file=output_path,
    )

    recipe.save(manifest_path)
    print_success(f"Recipe manifest saved to {manifest_path}")


@recipe_app.command("replay")
def recipe_replay(
    manifest: Path = typer.Argument(..., help="Recipe manifest file"),
    out: Path | None = typer.Option(None, "--out", "-o", help="Output directory"),
    verify: bool = typer.Option(True, "--verify/--no-verify", help="Verify output hash"),
):
    """Replay a recipe to regenerate output."""
    manifest_path = Path(manifest)
    if not manifest_path.exists():
        print_error(f"Manifest {manifest_path} not found.")
        raise typer.Exit(1)

    recipe_data = RecipeManifest.load(manifest_path)

    console = get_console()
    console.print("[bold]Replaying recipe:[/bold]")
    console.print(f"  Sketch: {recipe_data['sketch']}")
    console.print(f"  Seed: {recipe_data['seed']}")
    console.print(f"  Created: {recipe_data.get('created_at', 'unknown')}")

    # Discover sketches
    registry = get_registry()
    registry.discover_builtin()

    sketch_info = registry.get(recipe_data["sketch"])
    if not sketch_info:
        print_error(f"Sketch '{recipe_data['sketch']}' not found.")
        raise typer.Exit(1)

    # Reconstruct config
    config_obj = sketch_info.config_class(**recipe_data["config"])
    config_obj.seed = recipe_data["seed"]

    # Determine output
    if out is None:
        out = Path.cwd() / "out" / "replay"
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)

    # Render
    rng = RNG(recipe_data["seed"])
    quality = Quality(mode="final", supersample=2)

    ctx = RenderContext(
        rng=rng,
        width=config_obj.width,
        height=config_obj.height,
        quality=quality,
        output_dir=out,
    )

    console.print("\n[bold]Rendering...[/bold]")
    result = sketch_info.render_func(config_obj, ctx)

    # Save
    output_path = out / f"{recipe_data['sketch']}_replay_seed{recipe_data['seed']}.png"
    result.save(output_path)

    print_success(f"Replayed recipe. Output: {output_path}")

    # Verify if requested
    if verify and "output" in recipe_data:
        expected_hash = recipe_data["output"]["sha256"]
        actual_hash = RecipeManifest._hash_file_static(output_path)

        if expected_hash == actual_hash:
            print_success("Output hash matches! ✓")
        else:
            print_error("Output hash mismatch!")
            console.print(f"  Expected: {expected_hash[:16]}...")
            console.print(f"  Got:      {actual_hash[:16]}...")
            console.print(
                "[yellow]Note: Hash mismatches can occur due to floating-point differences or platform differences.[/yellow]"
            )


@recipe_app.command("verify")
def recipe_verify(
    manifest: Path = typer.Argument(..., help="Recipe manifest file"),
):
    """Verify a recipe manifest."""
    manifest_path = Path(manifest)
    if not manifest_path.exists():
        print_error(f"Manifest {manifest_path} not found.")
        raise typer.Exit(1)

    results = RecipeManifest.verify(manifest_path)

    console = get_console()
    if results["valid"]:
        print_success("Manifest is valid.")
    else:
        print_error("Manifest has errors:")
        for error in results["errors"]:
            console.print(f"  [red]✗[/red] {error}")

    if results["warnings"]:
        for warning in results["warnings"]:
            console.print(f"  [yellow]⚠[/yellow] {warning}")
