"""Animate command implementation."""

from pathlib import Path
from typing import Optional

import imageio
import typer

from numbrane_python.cli.utils import create_progress, get_console, print_error, print_success
from numbrane_python.core.config import Quality, load_config
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.preset import get_preset_store
from numbrane_python.core.registry import get_registry
from numbrane_python.core.rng import RNG

animate_app = typer.Typer(name="animate", help="Create animations")


@animate_app.command()
def animate(
    sketch: str = typer.Argument(..., help="Sketch name"),
    seed: int = typer.Option(42, "--seed", "-s", help="Random seed"),
    frames: int = typer.Option(60, "--frames", "-f", help="Number of frames"),
    fps: int = typer.Option(30, "--fps", help="Frames per second"),
    out: Path = typer.Option(None, "--out", "-o", help="Output directory"),
    config: Path | None = typer.Option(None, "--config", "-c", help="Config file"),
    preset: str | None = typer.Option(None, "--preset", "-p", help="Preset name"),
    width: int | None = typer.Option(None, "--width", "-w", help="Canvas width"),
    height: int | None = typer.Option(None, "--height", "-h", help="Canvas height"),
    format: str = typer.Option("gif", "--format", help="Output format (gif, mp4)"),
    sketch_path: Path | None = typer.Option(
        None, "--sketch-path", help="Additional sketch directory"
    ),
):
    """Render an animation."""
    console = get_console()

    registry = get_registry()
    registry.discover_builtin()
    if sketch_path:
        registry.discover_path(sketch_path)

    sketch_info = registry.get(sketch)
    if not sketch_info:
        print_error(f"Sketch '{sketch}' not found.")
        raise typer.Exit(1)

    if not sketch_info.animate_func:
        print_error(f"Sketch '{sketch}' does not support animation.")
        raise typer.Exit(1)

    # Load config
    config_obj = sketch_info.config_class()
    if preset:
        preset_store = get_preset_store()
        preset_data = preset_store.load(preset)
        if preset_data:
            config_obj = sketch_info.config_class(**preset_data.get("config", {}))
    elif config:
        config_dict = load_config(config)
        config_obj = sketch_info.config_class(**config_dict)

    config_obj.seed = seed
    if width:
        config_obj.width = width
    if height:
        config_obj.height = height

    # Determine output
    if out is None:
        out = Path.cwd() / "out" / sketch
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)

    quality = Quality(mode="final", supersample=1)
    rng = RNG(seed)

    # Render frames
    console.print(f"[bold]Rendering {frames} frames of {sketch}...[/bold]")
    frames_list = []

    with create_progress() as progress:
        task = progress.add_task("Rendering frames...", total=frames)

        for frame_idx in range(frames):
            time = frame_idx / max(frames - 1, 1)
            ctx = RenderContext(
                rng=rng.fork(offset=frame_idx),
                width=config_obj.width,
                height=config_obj.height,
                frame=frame_idx,
                time=time,
                quality=quality,
                output_dir=out,
            )

            frame_results = list(sketch_info.animate_func(config_obj, ctx))
            if frame_results:
                frame_result = (
                    frame_results[frame_idx]
                    if frame_idx < len(frame_results)
                    else frame_results[-1]
                )
                frames_list.append(frame_result.image)

            progress.update(task, advance=1)

    # Save animation
    output_path = out / f"{sketch}_seed{seed}.{format.lower()}"

    try:
        if format.lower() == "mp4":
            imageio.mimwrite(output_path, frames_list, fps=fps, codec="libx264")
        else:
            imageio.mimwrite(output_path, frames_list, fps=fps)
        print_success(f"Saved to {output_path}")
    except Exception as e:
        print_error(f"Failed to save animation: {e}")
        raise typer.Exit(1)
