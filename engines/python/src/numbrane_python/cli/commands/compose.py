"""Compose command for composite sketches."""

from pathlib import Path
from typing import List, Optional

import typer

from numbrane_python.cli.utils import get_console, print_error, print_info, print_success
from numbrane_python.meta.composite import BlendMode, CompositeSketch, create_composite

compose_app = typer.Typer(name="compose", help="Composite sketch operations")


@compose_app.command()
def compose(
    sketches: list[str] = typer.Argument(..., help="Sketch names to compose"),
    mode: str = typer.Option(
        "layered",
        "--mode",
        "-m",
        help="Blend mode (layered, sequential, interleaved, field_shared)",
    ),
    weights: str | None = typer.Option(
        None, "--weights", "-w", help="Per-sketch weights (comma-separated)"
    ),
    meta: str | None = typer.Option(
        None, "--meta", help="Meta-controls (e.g., 'violence=0.7,entropy=0.5')"
    ),
    out: Path = typer.Option(Path("out/compose"), "--out", "-o", help="Output directory"),
    seed: int = typer.Option(42, "--seed", "-s", help="Random seed"),
    sketch_path: Path | None = typer.Option(
        None, "--sketch-path", help="Additional sketch directory"
    ),
):
    """Create and render a composite sketch."""
    console = get_console()

    if len(sketches) < 2:
        print_error("Compose requires at least 2 sketches.")
        raise typer.Exit(1)

    # Parse blend mode
    try:
        blend_mode = BlendMode(mode)
    except ValueError:
        print_error(
            f"Invalid blend mode: {mode}. Use: layered, sequential, interleaved, field_shared"
        )
        raise typer.Exit(1)

    # Parse weights
    weight_list = None
    if weights:
        try:
            weight_list = [float(w.strip()) for w in weights.split(",")]
            if len(weight_list) != len(sketches):
                print_error(
                    f"Number of weights ({len(weight_list)}) must match number of sketches ({len(sketches)})"
                )
                raise typer.Exit(1)
        except ValueError:
            print_error("Invalid weights format. Use comma-separated floats.")
            raise typer.Exit(1)

    # Parse meta-controls
    meta_dict = {}
    if meta:
        for pair in meta.split(","):
            if "=" not in pair:
                print_error(f"Invalid meta format: {pair}. Use key=value")
                raise typer.Exit(1)
            key, value = pair.split("=", 1)
            try:
                meta_dict[key.strip()] = float(value.strip())
            except ValueError:
                print_error(f"Invalid meta value: {value}")
                raise typer.Exit(1)

    # Create composite
    composite_name = "_".join(sketches)
    composite = create_composite(
        name=composite_name,
        sketch_names=sketches,
        blend_mode=blend_mode,
        weights=weight_list,
    )

    console.print(f"[bold]Creating composite: {composite_name}[/bold]")
    console.print(f"Mode: {blend_mode.value}")
    console.print(f"Sketches: {', '.join(sketches)}")
    if meta_dict:
        console.print(f"Meta-controls: {meta_dict}")
    console.print()

    # Get merged schema
    merged_schema = composite.get_merged_schema()
    console.print(f"[dim]Merged schema: {len(merged_schema.params)} parameters[/dim]\n")

    # Resolve configs
    resolved_configs = composite.resolve_configs(meta_controls=meta_dict)

    console.print(f"[bold]Resolved {len(resolved_configs)} sketch configurations[/bold]")
    console.print("[dim]Note: Full composite rendering implementation pending[/dim]")
    console.print(f"[dim]Configs would be rendered with blend mode: {blend_mode.value}[/dim]")

    # Save composite definition
    out_path = Path(out)
    out_path.mkdir(parents=True, exist_ok=True)

    import json

    composite_def = {
        "name": composite_name,
        "sketches": sketches,
        "blend_mode": blend_mode.value,
        "weights": weight_list,
        "meta_controls": meta_dict,
        "resolved_configs": resolved_configs,
    }

    def_path = out_path / f"{composite_name}_definition.json"
    with open(def_path, "w") as f:
        json.dump(composite_def, f, indent=2)

    print_success(f"Composite definition saved to {def_path}")
    print_info("Full rendering implementation coming soon!")
