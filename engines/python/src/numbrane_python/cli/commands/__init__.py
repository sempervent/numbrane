"""CLI commands for numbrane_python.

Note: optional API/lab FastAPI packages are not part of the maintained engine; their CLI command
modules are not exported here so the CLI package imports cleanly.
"""

# Export command functions and apps
# compose_recipe commands are added to compose_app
from numbrane_python.cli.commands import compose_recipe  # noqa: F401
from numbrane_python.cli.commands.animate import animate_app
from numbrane_python.cli.commands.compose import compose_app
from numbrane_python.cli.commands.doctor import cmd_doctor
from numbrane_python.cli.commands.evolve import evolve_app
from numbrane_python.cli.commands.explore import explore_app
from numbrane_python.cli.commands.gallery import gallery_app
from numbrane_python.cli.commands.intent import intent_app, taste_app
from numbrane_python.cli.commands.library import library_app
from numbrane_python.cli.commands.list import cmd_list
from numbrane_python.cli.commands.meta import meta_app
from numbrane_python.cli.commands.params import params_app
from numbrane_python.cli.commands.plugin import plugin_app
from numbrane_python.cli.commands.preset import preset_app
from numbrane_python.cli.commands.recipe import recipe_app
from numbrane_python.cli.commands.render import render_app
from numbrane_python.cli.commands.schema import schema_app
from numbrane_python.cli.commands.sweep import sweep_app
from numbrane_python.cli.commands.watch import watch_app

__all__ = [
    "cmd_list",
    "cmd_doctor",
    "render_app",
    "animate_app",
    "sweep_app",
    "gallery_app",
    "preset_app",
    "recipe_app",
    "explore_app",
    "watch_app",
    "plugin_app",
    "params_app",
    "evolve_app",
    "schema_app",
    "meta_app",
    "compose_app",
    "library_app",
    "intent_app",
    "taste_app",
]
