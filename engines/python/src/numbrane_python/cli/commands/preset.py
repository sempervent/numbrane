"""Preset command implementation."""

import json
from pathlib import Path
from typing import Optional

import typer

from numbrane_python.cli.utils import (
    get_console,
    print_error,
    print_info,
    print_success,
    print_table,
)
from numbrane_python.core.config import load_config
from numbrane_python.core.preset import get_preset_store
from numbrane_python.core.registry import get_registry

preset_app = typer.Typer(name="preset", help="Manage presets")


@preset_app.command("list")
def preset_list(
    local: bool = typer.Option(False, "--local", help="Show local presets only"),
    preset_dir: Path | None = typer.Option(None, "--preset-dir", help="Custom preset directory"),
):
    """List all presets."""
    console = get_console()
    store = get_preset_store(preset_dir)
    presets = store.list()

    if not presets:
        print_info("No presets found.")
        return

    console.print(f"\n[bold]Found {len(presets)} preset(s):[/bold]\n")

    data = []
    for preset_name in presets:
        preset_data = store.load(preset_name)
        if preset_data:
            sketch = preset_data.get("sketch", "unknown")
            data.append([preset_name, sketch])

    print_table(data, ["Name", "Sketch"])


@preset_app.command("show")
def preset_show(
    name: str = typer.Argument(..., help="Preset name"),
    preset_dir: Path | None = typer.Option(None, "--preset-dir", help="Custom preset directory"),
):
    """Show preset details."""
    store = get_preset_store(preset_dir)
    preset_data = store.load(name)

    if not preset_data:
        print_error(f"Preset '{name}' not found.")
        raise typer.Exit(1)

    console = get_console()
    console.print(f"\n[bold]Preset: {name}[/bold]\n")
    console.print(json.dumps(preset_data, indent=2))


@preset_app.command("add")
def preset_add(
    name: str = typer.Argument(..., help="Preset name"),
    sketch: str = typer.Option(..., "--sketch", "-s", help="Sketch name"),
    config: Path = typer.Option(..., "--config", "-c", help="Config file"),
    description: str | None = typer.Option(
        None, "--description", "-d", help="Preset description"
    ),
    preset_dir: Path | None = typer.Option(None, "--preset-dir", help="Custom preset directory"),
):
    """Add a new preset."""
    store = get_preset_store(preset_dir)

    if store.exists(name):
        print_error(
            f"Preset '{name}' already exists. Use 'remove' first or choose a different name."
        )
        raise typer.Exit(1)

    # Load config
    config_dict = load_config(config)

    preset_data = {
        "sketch": sketch,
        "config": config_dict,
        "description": description or "",
    }

    store.save(name, preset_data)
    print_success(f"Preset '{name}' saved.")


@preset_app.command("remove")
def preset_remove(
    name: str = typer.Argument(..., help="Preset name"),
    preset_dir: Path | None = typer.Option(None, "--preset-dir", help="Custom preset directory"),
):
    """Remove a preset."""
    store = get_preset_store(preset_dir)

    if store.remove(name):
        print_success(f"Preset '{name}' removed.")
    else:
        print_error(f"Preset '{name}' not found.")
        raise typer.Exit(1)


@preset_app.command("export")
def preset_export(
    name: str = typer.Argument(..., help="Preset name"),
    output: Path = typer.Option(..., "--output", "-o", help="Output file"),
    preset_dir: Path | None = typer.Option(None, "--preset-dir", help="Custom preset directory"),
):
    """Export preset to file."""
    store = get_preset_store(preset_dir)
    preset_data = store.load(name)

    if not preset_data:
        print_error(f"Preset '{name}' not found.")
        raise typer.Exit(1)

    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w") as f:
        json.dump(preset_data, f, indent=2)

    print_success(f"Preset exported to {output_path}")


@preset_app.command("import")
def preset_import(
    file: Path = typer.Argument(..., help="Preset file to import"),
    name: str | None = typer.Option(
        None, "--name", "-n", help="Preset name (default: from file)"
    ),
    preset_dir: Path | None = typer.Option(None, "--preset-dir", help="Custom preset directory"),
):
    """Import preset from file."""
    file_path = Path(file)
    if not file_path.exists():
        print_error(f"File {file_path} not found.")
        raise typer.Exit(1)

    with open(file_path) as f:
        preset_data = json.load(f)

    preset_name = name or preset_data.get("name") or file_path.stem

    store = get_preset_store(preset_dir)
    store.save(preset_name, preset_data)
    print_success(f"Preset '{preset_name}' imported.")
