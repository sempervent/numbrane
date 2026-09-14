"""Watch command implementation."""

import time
from pathlib import Path
from typing import Optional

import typer

from numbrane_python.cli.utils import get_console, print_error, print_info, print_success
from numbrane_python.core.config import load_config
from numbrane_python.core.registry import get_registry

try:
    from watchdog.events import FileSystemEventHandler
    from watchdog.observers import Observer

    HAS_WATCHDOG = True
except ImportError:
    HAS_WATCHDOG = False


class ConfigWatcher(FileSystemEventHandler if HAS_WATCHDOG else object):
    """Watch for config file changes."""

    def __init__(self, sketch: str, config_path: Path, output_dir: Path, preview: bool):
        """Initialize watcher.

        Args:
            sketch: Sketch name
            config_path: Config file path
            output_dir: Output directory
            preview: Use preview mode
        """
        self.sketch = sketch
        self.config_path = config_path
        self.output_dir = output_dir
        self.preview = preview
        self.last_modified = 0

    def on_modified(self, event):
        """Handle file modification."""
        if event.src_path == str(self.config_path):
            current_time = time.time()
            # Debounce rapid changes
            if current_time - self.last_modified < 0.5:
                return
            self.last_modified = current_time

            print_info("Config changed, re-rendering...")
            self._render()

    def _render(self):
        """Render the sketch."""
        try:
            from numbrane_python.cli.commands.render import render as render_cmd

            # Call render with current config
            # This is a simplified version - in practice would need proper context
            console = get_console()
            console.print(f"[dim]Rendering {self.sketch}...[/dim]")

            # Would need to properly invoke render here
            # For now, just print a message
            print_info("Render triggered (full implementation would render here)")
        except Exception as e:
            print_error(f"Render failed: {e}")


watch_app = typer.Typer(name="watch", help="Live preview mode")


@watch_app.command()
def watch(
    sketch: str = typer.Argument(..., help="Sketch name"),
    config: Path = typer.Argument(..., help="Config file to watch"),
    out: Path = typer.Option(None, "--out", "-o", help="Output directory"),
    preview: bool = typer.Option(True, "--preview/--no-preview", help="Fast preview mode"),
    sketch_path: Path | None = typer.Option(
        None, "--sketch-path", help="Additional sketch directory"
    ),
):
    """Watch config file and re-render on changes."""
    console = get_console()

    config_path = Path(config)
    if not config_path.exists():
        print_error(f"Config file {config_path} not found.")
        raise typer.Exit(1)

    # Check if watchdog is available
    if not HAS_WATCHDOG:
        print_error(
            "watchdog not installed. Install with: uv pip install watchdog or pip install watchdog"
        )
        raise typer.Exit(1)

    # Determine output
    if out is None:
        out = Path.cwd() / "out" / sketch / "watch"
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)

    console.print(f"[bold]Watching {config_path} for changes...[/bold]")
    console.print(f"[dim]Output: {out}[/dim]")
    console.print("[dim]Press Ctrl+C to stop[/dim]\n")

    # Create watcher
    event_handler = ConfigWatcher(sketch, config_path, out, preview)
    observer = Observer()
    observer.schedule(event_handler, str(config_path.parent), recursive=False)
    observer.start()

    try:
        # Initial render
        event_handler._render()

        # Watch loop
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        console.print("\n[yellow]Stopping watcher...[/yellow]")
        observer.stop()

    observer.join()
    print_success("Watcher stopped.")
