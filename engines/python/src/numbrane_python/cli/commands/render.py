"""Render command implementation."""

import hashlib
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import typer

from numbrane_python.cli.utils import create_progress, get_console, print_error, print_success
from numbrane_python.core.config import Quality, load_config
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.preset import get_preset_store, load_preset
from numbrane_python.core.registry import get_registry
from numbrane_python.core.rng import RNG


def _set_nested_config(config_obj, path: str, value: Any) -> None:
    """Set nested value in config object."""
    parts = path.split(".")
    current = config_obj
    for part in parts[:-1]:
        if hasattr(current, part):
            current = getattr(current, part)
        else:
            # Create nested object if needed
            setattr(current, part, type("Config", (), {})())
            current = getattr(current, part)
    setattr(current, parts[-1], value)


render_app = typer.Typer(name="render", help="Render still images")


@render_app.command()
def render(
    sketch: str = typer.Argument(..., help="Sketch name"),
    seed: int = typer.Option(42, "--seed", "-s", help="Random seed"),
    out: Path = typer.Option(
        None, "--out", "-o", help="Output directory (default: ./out/<sketch>/<timestamp>)"
    ),
    config: Path | None = typer.Option(None, "--config", "-c", help="Config file (YAML/JSON)"),
    preset: str | None = typer.Option(None, "--preset", "-p", help="Preset name"),
    set_param: list[str] | None = typer.Option(
        None, "--set", help="Set parameter (key=value, can be used multiple times)"
    ),
    meta: str | None = typer.Option(
        None, "--meta", help="Meta-controls (e.g., 'violence=0.7,entropy=0.5')"
    ),
    intent: str | None = typer.Option(
        None, "--intent", help="Intent text (e.g., 'ritualistic, calm, slightly bored')"
    ),
    width: int | None = typer.Option(None, "--width", "-w", help="Canvas width"),
    height: int | None = typer.Option(None, "--height", "-h", help="Canvas height"),
    preview: bool = typer.Option(False, "--preview", help="Fast preview mode"),
    format: str = typer.Option("png", "--format", "-f", help="Output format (png, jpg)"),
    param_hash: bool = typer.Option(False, "--param-hash", help="Print parameter hash and exit"),
    dry_run: bool = typer.Option(
        False, "--dry-run", help="Validate and print resolved params without rendering"
    ),
    library: bool = typer.Option(True, "--library/--no-library", help="Register in library"),
    sketch_path: Path | None = typer.Option(
        None, "--sketch-path", help="Additional sketch directory"
    ),
):
    """Render a single image."""
    console = get_console()

    # Discover sketches
    registry = get_registry()
    registry.discover_builtin()
    if sketch_path:
        registry.discover_path(sketch_path)

    sketch_info = registry.get(sketch)
    if not sketch_info:
        print_error(f"Sketch '{sketch}' not found.")
        console.print(f"Available sketches: {', '.join(registry.list())}")
        raise typer.Exit(1)

    # Load config
    config_obj = sketch_info.config_class()

    # Load from preset if specified
    if preset:
        preset_store = get_preset_store()
        preset_data = preset_store.load(preset)
        if preset_data:
            config_obj = sketch_info.config_class(**preset_data.get("config", {}))
        else:
            print_error(f"Preset '{preset}' not found.")
            raise typer.Exit(1)
    elif config:
        config_dict = load_config(config)
        config_obj = sketch_info.config_class(**config_dict)

    # Parse intent if provided
    intent_meta = None
    intent_text = None
    if intent:
        from numbrane_python.interpret.parser import IntentParser

        parser = IntentParser()
        intent_result = parser.parse(intent)
        intent_meta = intent_result.meta
        intent_text = intent
        console.print(f"[dim]Intent parsed: {intent_result.explanation}[/dim]")

    # Apply meta-controls if provided (explicit meta takes precedence over intent)
    if meta:
        from numbrane_python.core.schema_registry import register_sketch_schemas
        from numbrane_python.meta.resolver import MetaResolver
        from numbrane_python.params.schema import get_registry as get_schema_registry

        register_sketch_schemas()
        schema_registry = get_schema_registry()
        schema = schema_registry.get(sketch)

        if schema:
            # Parse meta-controls
            meta_dict = {}
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

            # Resolve meta-controls
            resolver = MetaResolver()
            config_dict = config_obj.model_dump() if hasattr(config_obj, "model_dump") else {}
            resolved, provenance_resolution = resolver.resolve(config_dict, meta_dict, schema)

            # Record intent in provenance if provided
            if intent_text and hasattr(provenance_resolution, "intent"):
                provenance_resolution.intent = intent_text
                provenance_resolution.intent_meta = intent_meta

            # Store for library registration (use unique variable name)
            meta_controls_for_library = meta_dict.copy()
            base_config_for_library = config_dict.copy()
            provenance_for_library = provenance_resolution

            # Update config object
            config_obj = sketch_info.config_class(**resolved)

            if dry_run:
                console.print("\n[bold]Meta-Control Resolution:[/bold]")
                console.print(f"Meta-controls: {meta_dict}")
                if provenance_resolution.changes:
                    console.print("\n[bold]Parameter Changes:[/bold]")
                    for path, value in provenance_resolution.changes.items():
                        console.print(f"  {path}: {value}")
                if provenance_resolution.conflicts:
                    console.print("\n[bold]Conflicts:[/bold]")
                    for conflict in provenance_resolution.conflicts:
                        console.print(f"  {conflict}")
                console.print(f"\nParam hash: {provenance_resolution.param_hash}")
                return
    elif intent_meta:
        # Apply intent-derived meta-controls if no explicit meta provided
        from numbrane_python.core.schema_registry import register_sketch_schemas
        from numbrane_python.meta.resolver import MetaResolver
        from numbrane_python.params.schema import get_registry as get_schema_registry

        register_sketch_schemas()
        schema_registry = get_schema_registry()
        schema = schema_registry.get(sketch)

        if schema:
            resolver = MetaResolver()
            config_dict = config_obj.model_dump() if hasattr(config_obj, "model_dump") else {}
            resolved, provenance_resolution = resolver.resolve(config_dict, intent_meta, schema)

            # Record intent in provenance
            if hasattr(provenance_resolution, "intent"):
                provenance_resolution.intent = intent_text
                provenance_resolution.intent_meta = intent_meta

            meta_controls_for_library = intent_meta.copy()
            base_config_for_library = config_dict.copy()
            provenance_for_library = provenance_resolution

            config_obj = sketch_info.config_class(**resolved)

            if dry_run:
                console.print("\n[bold]Intent Resolution:[/bold]")
                console.print(f"Intent: {intent_text}")
                console.print(f"Derived meta-controls: {intent_meta}")
                if hasattr(provenance_resolution, "changes") and provenance_resolution.changes:
                    console.print("\n[bold]Parameter Changes:[/bold]")
                    for path, value in provenance_resolution.changes.items():
                        console.print(f"  {path}: {value}")
                console.print(f"\nParam hash: {provenance_resolution.param_hash}")
                return

    # Apply --set overrides
    if set_param:
        for override in set_param:
            if "=" not in override:
                print_error(f"Invalid --set format: {override}. Use key=value")
                raise typer.Exit(1)
            key, value = override.split("=", 1)
            # Parse value
            try:
                # Try numeric
                if "." in value:
                    parsed_value = float(value)
                else:
                    parsed_value = int(value)
            except ValueError:
                # String or bool
                if value.lower() in ["true", "false"]:
                    parsed_value = value.lower() == "true"
                else:
                    parsed_value = value

            # Set nested value
            _set_nested_config(config_obj, key, parsed_value)

    # Override seed and dimensions
    config_obj.seed = seed
    if width:
        config_obj.width = width
    if height:
        config_obj.height = height

    # Compute param hash if requested
    if param_hash or dry_run:
        from numbrane_python.params.normalize import canonicalize_params, param_hash_short

        config_dict = config_obj.model_dump() if hasattr(config_obj, "model_dump") else {}
        canonical = canonicalize_params(config_dict)
        hash_short = param_hash_short(canonical)
        console.print(f"[bold]Parameter hash:[/bold] {hash_short}")

        if dry_run:
            console.print("\n[bold]Resolved parameters:[/bold]")
            console.print(json.dumps(canonical, indent=2))
            return
        elif param_hash:
            return

    # Preview mode
    if preview:
        if sketch_info.preview_overrides_func:
            config_obj = sketch_info.preview_overrides_func(config_obj)
        quality = Quality(mode="preview", supersample=1)
    else:
        quality = Quality(mode="final", supersample=2)

    # Determine output directory
    if out is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        out = Path.cwd() / "out" / sketch / timestamp
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)

    # Create context
    rng = RNG(seed)
    ctx = RenderContext(
        rng=rng,
        width=config_obj.width,
        height=config_obj.height,
        quality=quality,
        output_dir=out,
    )

    # Get final configs for library (before rendering)
    resolved_config_dict = config_obj.model_dump() if hasattr(config_obj, "model_dump") else {}
    # Get from scope if set by meta-control resolution
    base_config_dict = locals().get("base_config_for_library", resolved_config_dict.copy())
    meta_controls_dict = locals().get("meta_controls_for_library", {})
    provenance_obj = locals().get("provenance_for_library", None)

    # Render
    console.print(f"[bold]Rendering {sketch} with seed {seed}...[/bold]")
    with create_progress() as progress:
        task = progress.add_task("Rendering...", total=None)
        result = sketch_info.render_func(config_obj, ctx)
        progress.update(task, completed=True)

    # Register in library if requested
    if library:
        try:
            from numbrane_python.library.api import register_run

            # Convert provenance to dict if needed
            provenance_dict = None
            if provenance_obj:
                if hasattr(provenance_obj, "to_dict"):
                    provenance_dict = provenance_obj.to_dict()
                elif isinstance(provenance_obj, dict):
                    provenance_dict = provenance_obj

            register_run(
                sketch_name=sketch,
                seed=seed,
                image=result.image,
                base_config=base_config_dict,
                resolved_config=resolved_config_dict,
                meta_controls=meta_controls_dict if meta_controls_dict else None,
                provenance=provenance_dict,
                output_format=format,
            )
            console.print("[dim]Registered in library[/dim]")
        except Exception as e:
            console.print(f"[yellow]Warning: Failed to register in library: {e}[/yellow]")

    # Generate filename with config hash
    config_hash = hashlib.sha256(
        json.dumps(config_obj.model_dump(), sort_keys=True).encode()
    ).hexdigest()[:8]

    ext = format.lower()
    if ext not in ["png", "jpg", "jpeg"]:
        ext = "png"

    output_path = out / f"{sketch}_seed{seed}_{config_hash}.{ext}"

    # Save image
    from PIL import Image

    if result.image.shape[2] == 4:
        mode = "RGBA"
    else:
        mode = "RGB"
    img = Image.fromarray(result.image, mode=mode)
    img.save(output_path)

    # Save manifest
    manifest_path = output_path.with_suffix(".json")
    manifest = result.metadata
    manifest["output_file"] = str(output_path)
    manifest["config_hash"] = config_hash
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print_success(f"Saved to {output_path}")
    console.print(f"[dim]Manifest: {manifest_path}[/dim]")

    # Print determinism info
    console.print("\n[bold]Reproducibility:[/bold]")
    console.print(f"  Seed: {seed}")
    console.print(f"  Config hash: {config_hash}")
    console.print(f"  Git hash: {manifest.get('git_hash', 'N/A')}")
