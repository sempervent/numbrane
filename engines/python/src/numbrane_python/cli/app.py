"""Main Typer application."""

from pathlib import Path
from typing import Optional

import typer

from numbrane_python.cli import commands
from numbrane_python.cli.utils import setup_rich_console

# Create main app
app = typer.Typer(
    name="numbrane",
    help="Generative Art Framework - Create beautiful, deterministic generative art",
    add_completion=True,
    rich_markup_mode="rich",
)

# Add command groups
app.add_typer(commands.render_app, name="render", help="Render still images")
app.add_typer(commands.animate_app, name="animate", help="Create animations")
app.add_typer(commands.sweep_app, name="sweep", help="Batch render with seed ranges")
app.add_typer(commands.gallery_app, name="gallery", help="Generate HTML galleries")
app.add_typer(commands.preset_app, name="preset", help="Manage presets")
app.add_typer(commands.recipe_app, name="recipe", help="Recipe manifests for reproducibility")
app.add_typer(commands.explore_app, name="explore", help="Parameter space exploration")
app.add_typer(commands.watch_app, name="watch", help="Live preview mode")
app.add_typer(commands.plugin_app, name="plugin", help="Plugin management")
app.add_typer(commands.params_app, name="params", help="Parameter space operations")
app.add_typer(commands.evolve_app, name="evolve", help="Evolutionary parameter search")
app.add_typer(commands.schema_app, name="schema", help="Parameter schema operations")
app.add_typer(commands.meta_app, name="meta", help="Meta-control operations")
app.add_typer(commands.compose_app, name="compose", help="Composite sketch operations")
app.add_typer(commands.library_app, name="library", help="Run library and curation")
app.add_typer(commands.intent_app, name="interpret", help="Intent interpretation")
app.add_typer(commands.taste_app, name="taste", help="Taste profile management")

# Add standalone commands
app.command(name="list")(commands.cmd_list)
app.command(name="doctor")(commands.cmd_doctor)


# Global options callback
@app.callback()
def global_options(
    ctx: typer.Context,
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Verbose output"),
    quiet: bool = typer.Option(False, "--quiet", "-q", help="Quiet output"),
    sketch_path: Path | None = typer.Option(
        None, "--sketch-path", help="Additional directory to search for sketches"
    ),
    json_output: bool = typer.Option(False, "--json", help="JSON output mode"),
    profile: bool = typer.Option(False, "--profile", help="Profile execution time"),
):
    """Global options for numbrane commands."""
    ctx.ensure_object(dict)
    ctx.obj["verbose"] = verbose
    ctx.obj["quiet"] = quiet
    ctx.obj["sketch_path"] = sketch_path
    ctx.obj["json_output"] = json_output
    ctx.obj["profile"] = profile

    # Setup console
    setup_rich_console(verbose, quiet, json_output)


def main():
    """Entry point for numbrane CLI."""
    app()


if __name__ == "__main__":
    main()
