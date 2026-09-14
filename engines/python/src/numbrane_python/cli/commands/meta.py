"""Meta-control CLI commands."""

import json
from typing import Dict, Optional

import typer

from numbrane_python.cli.utils import (
    get_console,
    print_error,
    print_info,
    print_success,
    print_table,
)
from numbrane_python.meta.control import get_meta_control, get_meta_controls
from numbrane_python.meta.resolver import MetaResolver

meta_app = typer.Typer(name="meta", help="Meta-control operations")


@meta_app.command("list")
def meta_list():
    """List all available meta-controls."""
    console = get_console()
    controls = get_meta_controls()

    data = []
    for name, control in sorted(controls.items()):
        num_rules = len(control.mapping.rules) if control.mapping else 0
        data.append(
            [
                name,
                control.description,
                f"{num_rules} rules",
            ]
        )

    if data:
        print_table(data, ["Name", "Description", "Mappings"])
    else:
        print_info("No meta-controls found.")


@meta_app.command("show")
def meta_show(
    name: str = typer.Argument(..., help="Meta-control name"),
):
    """Show detailed information about a meta-control."""
    console = get_console()

    control = get_meta_control(name)
    if not control:
        print_error(f"Meta-control '{name}' not found.")
        raise typer.Exit(1)

    console.print(f"\n[bold]Meta-Control: {name}[/bold]\n")
    console.print(f"{control.description}\n")
    console.print(f"Default: {control.default}\n")

    if control.mapping and control.mapping.rules:
        console.print("[bold]Parameter Mappings:[/bold]")
        data = []
        for rule in sorted(control.mapping.rules, key=lambda r: r.priority, reverse=True):
            data.append(
                [
                    rule.param_path,
                    rule.curve.value,
                    f"{rule.scale:.2f}",
                    f"{rule.offset:.2f}",
                    "invert" if rule.invert else "",
                    str(rule.priority),
                ]
            )
        print_table(data, ["Parameter", "Curve", "Scale", "Offset", "Invert", "Priority"])
    else:
        print_info("No mappings defined.")


@meta_app.command("explain")
def meta_explain(
    meta_controls: str = typer.Argument(
        ..., help="Meta-controls as key=value pairs (e.g., 'violence=0.7,entropy=0.5')"
    ),
    sketch: str | None = typer.Option(None, "--sketch", "-s", help="Sketch name for context"),
):
    """Explain what meta-controls would do."""
    console = get_console()

    # Parse meta-controls
    meta_dict = {}
    for pair in meta_controls.split(","):
        if "=" not in pair:
            print_error(f"Invalid format: {pair}. Use key=value")
            raise typer.Exit(1)
        key, value = pair.split("=", 1)
        try:
            meta_dict[key.strip()] = float(value.strip())
        except ValueError:
            print_error(f"Invalid value: {value}")
            raise typer.Exit(1)

    # Get schema if sketch provided
    schema = None
    if sketch:
        from numbrane_python.core.registry import get_registry
        from numbrane_python.core.schema_registry import register_sketch_schemas
        from numbrane_python.params.schema import get_registry as get_schema_registry

        registry = get_registry()
        registry.discover_builtin()
        register_sketch_schemas()
        schema_registry = get_schema_registry()
        schema = schema_registry.get(sketch)

        if not schema:
            print_error(f"Schema for '{sketch}' not found.")
            raise typer.Exit(1)

    # Explain
    resolver = MetaResolver()
    if schema:
        explanation = resolver.explain(meta_dict, schema)

        console.print("\n[bold]Meta-Control Effects:[/bold]\n")
        for meta_name, info in explanation["meta_controls"].items():
            console.print(f"[cyan]{meta_name}[/cyan] = {info['value']:.2f}")
            console.print(f"  {info['description']}")
            console.print(f"  Affects {info['affected_params']} parameters\n")

        if explanation["affected_parameters"]:
            console.print("[bold]Affected Parameters:[/bold]")
            data = []
            for param_path, info in sorted(explanation["affected_parameters"].items()):
                meta_list = ", ".join(info["meta_controls"])
                new_val = info["new"]
                data.append(
                    [
                        param_path,
                        f"{new_val:.3f}" if isinstance(new_val, (int, float)) else str(new_val),
                        meta_list,
                    ]
                )
            print_table(data, ["Parameter", "New Value", "From Meta-Controls"])
    else:
        # Just show meta-controls
        console.print("\n[bold]Meta-Controls:[/bold]\n")
        for meta_name, value in meta_dict.items():
            control = get_meta_control(meta_name)
            if control:
                console.print(f"[cyan]{meta_name}[/cyan] = {value:.2f}")
                console.print(f"  {control.description}")
                if control.mapping:
                    console.print(f"  {len(control.mapping.rules)} mapping rules")
                console.print()
