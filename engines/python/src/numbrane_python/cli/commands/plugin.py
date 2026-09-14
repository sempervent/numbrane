"""Plugin command implementation."""

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
from numbrane_python.core.registry import get_registry

plugin_app = typer.Typer(name="plugin", help="Plugin management")


@plugin_app.command("list")
def plugin_list(
    sketch_path: Path | None = typer.Option(
        None, "--sketch-path", help="Additional sketch directory"
    ),
):
    """List all discovered plugins."""
    console = get_console()

    registry = get_registry()
    registry.discover_builtin()
    if sketch_path:
        registry.discover_path(sketch_path)

    sketches = registry.list()

    if not sketches:
        print_info("No plugins found.")
        return

    console.print(f"\n[bold]Found {len(sketches)} plugin(s):[/bold]\n")

    data = []
    for sketch_name in sketches:
        sketch_info = registry.get(sketch_name)
        if sketch_info:
            supports_anim = "Yes" if sketch_info.animate_func else "No"
            data.append([sketch_name, supports_anim])

    print_table(data, ["Name", "Animation"])


@plugin_app.command("info")
def plugin_info(
    name: str = typer.Argument(..., help="Plugin name"),
    sketch_path: Path | None = typer.Option(
        None, "--sketch-path", help="Additional sketch directory"
    ),
):
    """Show plugin information."""
    registry = get_registry()
    registry.discover_builtin()
    if sketch_path:
        registry.discover_path(sketch_path)

    sketch_info = registry.get(name)
    if not sketch_info:
        print_error(f"Plugin '{name}' not found.")
        raise typer.Exit(1)

    console = get_console()
    console.print(f"\n[bold]Plugin: {name}[/bold]\n")

    config = sketch_info.config_class()
    console.print("[bold]Configuration:[/bold]")
    for field_name, field_info in config.model_fields.items():
        default = field_info.default
        desc = field_info.description or ""
        console.print(f"  [yellow]{field_name}[/yellow]: {default}")
        if desc:
            console.print(f"    {desc}")

    console.print("\n[bold]Capabilities:[/bold]")
    console.print(f"  Animation: {'Yes' if sketch_info.animate_func else 'No'}")
    console.print(f"  Preview overrides: {'Yes' if sketch_info.preview_overrides_func else 'No'}")


@plugin_app.command("scaffold")
def plugin_scaffold(
    name: str = typer.Argument(..., help="Plugin name"),
    output_dir: Path = typer.Option(
        Path.cwd() / "sketches", "--output", "-o", help="Output directory"
    ),
):
    """Scaffold a new plugin."""
    console = get_console()

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    plugin_file = output_path / f"{name}.py"

    if plugin_file.exists():
        print_error(f"Plugin file {plugin_file} already exists.")
        raise typer.Exit(1)

    # Generate template
    template = f'''"""Generated sketch plugin: {name}."""

from pydantic import BaseModel, Field
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult
from numbrane_python.render.canvas import Canvas
from numbrane_python.render.draw import draw_gradient
import numpy as np


class {name.capitalize()}Config(BaseModel):
    """Configuration for {name} sketch."""
    seed: int = Field(default=42, description="Random seed")
    width: int = Field(default=1920, description="Canvas width")
    height: int = Field(default=1080, description="Canvas height")

    # Add your parameters here
    # example_param: float = Field(default=1.0, description="Example parameter")


def render(config: {name.capitalize()}Config, ctx: RenderContext) -> RenderResult:
    """Render {name} sketch."""
    # Create canvas
    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    # Your rendering logic here
    # Example: gradient background
    draw_gradient(layer, np.array([0, 0, 0]), np.array([50, 50, 100]))

    image = canvas.get_image()

    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="{name}",
        config=config,
    )


# Optional: implement animate function for animation support
# def animate(config: {name.capitalize()}Config, ctx: RenderContext):
#     """Animate {name} sketch."""
#     from numbrane_python.core.render_result import FrameResult
#     # Your animation logic here
#     yield FrameResult(image, frame, time)
'''

    with open(plugin_file, "w") as f:
        f.write(template)

    # Create test file
    test_file = output_path.parent.parent / "tests" / f"test_{name}.py"
    if not test_file.parent.exists():
        test_file.parent.mkdir(parents=True, exist_ok=True)

    test_template = f'''"""Tests for {name} sketch."""

from numbrane_python.core.rng import RNG
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.config import Quality
from numbrane_python.sketches.{name} import {name.capitalize()}Config, render


def test_{name}_render():
    """Test {name} rendering."""
    config = {name.capitalize()}Config(seed=42, width=100, height=100)
    rng = RNG(42)
    ctx = RenderContext(rng, 100, 100, quality=Quality(mode="preview"))

    result = render(config, ctx)
    assert result.image.shape == (100, 100, 3)
'''

    if not test_file.exists():
        with open(test_file, "w") as f:
            f.write(test_template)

    print_success(f"Plugin scaffolded: {plugin_file}")
    console.print(f"[dim]Test file: {test_file}[/dim]")
    console.print("\n[bold]Next steps:[/bold]")
    console.print(f"  1. Edit {plugin_file} to implement your sketch")
    console.print(f"  2. Test with: numbrane render {name} --seed 42")
    console.print("  3. Add to your sketch path or move to sketches/")
