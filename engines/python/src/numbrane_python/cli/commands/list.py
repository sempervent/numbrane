"""List command implementation."""

from pathlib import Path

import typer

from numbrane_python.cli.utils import get_console, print_info, print_table
from numbrane_python.core.registry import get_registry
from numbrane_python.core.schema_registry import register_sketch_schemas


def cmd_list(
    sketch_path: typer.Option(
        None, "--sketch-path", help="Additional directory to search for sketches"
    ),
    json_output: bool = typer.Option(False, "--json", help="JSON output mode"),
):
    """List all available sketches."""
    registry = get_registry()
    registry.discover_builtin()

    if sketch_path:
        registry.discover_path(Path(sketch_path))

    # Register schemas
    register_sketch_schemas()

    sketches = registry.list()

    if json_output:
        import json

        data = []
        for sketch_name in sketches:
            sketch_info = registry.get(sketch_name)
            if sketch_info:
                config = sketch_info.config_class()
                params = {}
                for field_name, field_info in config.model_fields.items():
                    params[field_name] = {
                        "default": field_info.default,
                        "description": field_info.description or "",
                    }
                data.append(
                    {
                        "name": sketch_name,
                        "parameters": params,
                        "supports_animation": sketch_info.animate_func is not None,
                    }
                )
        get_console().print(json.dumps(data, indent=2))
        return

    if not sketches:
        print_info("No sketches found.")
        return

    console = get_console()
    console.print(f"\n[bold]Found {len(sketches)} sketch(es):[/bold]\n")

    for sketch_name in sketches:
        sketch_info = registry.get(sketch_name)
        if sketch_info:
            config = sketch_info.config_class()
            console.print(f"[cyan]{sketch_name}[/cyan]")
            if sketch_info.animate_func:
                console.print("  [dim]Supports animation[/dim]")
            console.print("  [dim]Configurable parameters:[/dim]")
            for field_name, field_info in config.model_fields.items():
                default = field_info.default
                desc = field_info.description or ""
                console.print(f"    [yellow]{field_name}[/yellow]: {default} - {desc}")
            console.print()
