"""Params command implementation."""

import json
from pathlib import Path
from typing import Optional

import typer
import yaml

from numbrane_python.cli.utils import (
    get_console,
    print_error,
    print_info,
    print_success,
    print_table,
)
from numbrane_python.core.registry import get_registry
from numbrane_python.paramspace.constraint import ConstraintMode
from numbrane_python.paramspace.param import ChoiceParam, FloatParam, IntParam
from numbrane_python.paramspace.sampler import (
    GridSampler,
    LatinHypercubeSampler,
    RandomSampler,
    SobolSampler,
)

params_app = typer.Typer(name="params", help="Parameter space operations")


@params_app.command("describe")
def params_describe(
    sketch: str = typer.Argument(..., help="Sketch name"),
    format: str = typer.Option(
        "text", "--format", "-f", help="Output format (text, json, json-schema)"
    ),
    sketch_path: Path | None = typer.Option(
        None, "--sketch-path", help="Additional sketch directory"
    ),
):
    """Describe parameter space for a sketch."""
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
        console.print("Use 'numbrane list' to see which sketches support parameter spaces.")
        raise typer.Exit(1)

    param_space = sketch_info.param_space_func()

    if format == "json":
        # Output as JSON
        data = {
            "sketch": sketch,
            "parameters": [p.to_dict() for p in param_space.params.values()],
            "conditions": [c.description for c in param_space.conditions],
            "constraints": [c.description for c in param_space.constraints],
        }
        console.print(json.dumps(data, indent=2))
        return

    if format == "json-schema":
        schema = param_space.to_json_schema()
        console.print(json.dumps(schema, indent=2))
        return

    # Text format
    console.print(f"\n[bold]Parameter Space: {sketch}[/bold]\n")

    console.print("[bold]Parameters:[/bold]")
    data = []
    for path, param in sorted(param_space.params.items()):
        param_dict = param.to_dict()
        type_info = param_dict.get("type", "unknown")
        if isinstance(param, FloatParam):
            range_info = f"[{param.min_val}, {param.max_val}]"
            dist_info = f" ({param.distribution.value})"
        elif isinstance(param, IntParam):
            range_info = f"[{param.min_val}, {param.max_val}]"
            dist_info = f" ({param.distribution.value})"
        elif isinstance(param, ChoiceParam):
            range_info = f"choices: {param.choices}"
            dist_info = ""
        else:
            range_info = ""
            dist_info = ""

        data.append(
            [
                path,
                type_info,
                range_info,
                str(param.default),
                param.description or "",
            ]
        )

    print_table(data, ["Path", "Type", "Range/Choices", "Default", "Description"])

    if param_space.conditions:
        console.print("\n[bold]Conditions:[/bold]")
        for condition in param_space.conditions:
            console.print(f"  • {condition.description}")

    if param_space.constraints:
        console.print("\n[bold]Constraints:[/bold]")
        for constraint in param_space.constraints:
            console.print(f"  • {constraint.description}")


@params_app.command("sample")
def params_sample(
    sketch: str = typer.Argument(..., help="Sketch name"),
    n: int = typer.Option(20, "--n", "-n", help="Number of samples"),
    seed: int = typer.Option(42, "--seed", "-s", help="Random seed"),
    sampler: str = typer.Option("random", "--sampler", help="Sampler (random, grid, lhs, sobol)"),
    out: Path = typer.Option(Path("configs"), "--out", "-o", help="Output directory"),
    format: str = typer.Option("yaml", "--format", "-f", help="Config format (yaml, json)"),
    set_overrides: str | None = typer.Option(
        None, "--set", help="Override values (key=value,key2=value2)"
    ),
    constraints: str = typer.Option(
        "reject", "--constraints", help="Constraint mode (reject, repair, warn)"
    ),
    sketch_path: Path | None = typer.Option(
        None, "--sketch-path", help="Additional sketch directory"
    ),
):
    """Sample configurations from parameter space."""
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

    # Parse overrides
    overrides = {}
    if set_overrides:
        for pair in set_overrides.split(","):
            if "=" in pair:
                key, value = pair.split("=", 1)
                # Try to parse value
                try:
                    if "." in value:
                        overrides[key] = float(value)
                    else:
                        overrides[key] = int(value)
                except ValueError:
                    overrides[key] = value

    # Choose sampler
    sampler_map = {
        "random": RandomSampler(),
        "grid": GridSampler(),
        "lhs": LatinHypercubeSampler(),
        "sobol": SobolSampler(),
    }

    if sampler not in sampler_map:
        print_error(f"Unknown sampler: {sampler}. Choose from: {', '.join(sampler_map.keys())}")
        raise typer.Exit(1)

    sampler_obj = sampler_map[sampler]

    # Parse constraint mode
    try:
        constraint_mode = ConstraintMode(constraints)
    except ValueError:
        print_error(f"Unknown constraint mode: {constraints}")
        raise typer.Exit(1)

    # Sample
    console.print(f"[bold]Sampling {n} configurations...[/bold]")
    samples = sampler_obj.sample(param_space, n, seed, overrides, constraint_mode)

    # Save
    out_path = Path(out)
    out_path.mkdir(parents=True, exist_ok=True)

    for i, (config, provenance) in enumerate(samples):
        filename = f"{sketch}_sample{i:04d}.{format}"
        filepath = out_path / filename

        # Add provenance to config metadata
        config_with_meta = {
            "_provenance": provenance,
            "_sample_index": i,
            "_sampler": sampler,
            "_seed": seed,
            **config,
        }

        if format == "yaml":
            with open(filepath, "w") as f:
                yaml.dump(config_with_meta, f, default_flow_style=False, sort_keys=False)
        else:
            with open(filepath, "w") as f:
                json.dump(config_with_meta, f, indent=2)

    print_success(f"Generated {len(samples)} samples in {out_path}")
