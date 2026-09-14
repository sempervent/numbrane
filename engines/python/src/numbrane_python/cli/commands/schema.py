"""Schema command implementation."""

import json
from pathlib import Path
from typing import Any, Optional, Tuple

import numpy as np
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
from numbrane_python.core.schema_registry import register_sketch_schemas
from numbrane_python.params.export import export_schema_json, export_schema_markdown
from numbrane_python.params.normalize import canonicalize_params, param_hash, param_hash_short
from numbrane_python.params.schema import get_registry as get_schema_registry
from numbrane_python.params.validate import validate_params

schema_app = typer.Typer(name="schema", help="Parameter schema operations")


@schema_app.command("list")
def schema_list(
    sketch_path: Path | None = typer.Option(
        None, "--sketch-path", help="Additional sketch directory"
    ),
):
    """List all available schemas."""
    console = get_console()

    registry = get_registry()
    registry.discover_builtin()
    if sketch_path:
        registry.discover_path(sketch_path)

    # Register schemas
    register_sketch_schemas()

    sketches = registry.list()
    schema_registry = get_schema_registry()

    data = []
    for sketch_name in sketches:
        sketch_info = registry.get(sketch_name)
        has_schema = False
        has_param_space = False

        if sketch_info:
            # Check for new schema system
            if hasattr(sketch_info.module, "get_schema"):
                has_schema = True
            # Check for old param_space
            if sketch_info.param_space_func:
                has_param_space = True

        schema_status = []
        if has_schema:
            schema_status.append("schema")
        if has_param_space:
            schema_status.append("param_space")

        data.append(
            [
                sketch_name,
                ", ".join(schema_status) if schema_status else "none",
            ]
        )

    if data:
        print_table(data, ["Sketch", "Schema Support"])
    else:
        print_info("No sketches found.")


@schema_app.command("show")
def schema_show(
    name: str = typer.Argument(..., help="Schema name (sketch name)"),
    format: str = typer.Option(
        "text", "--format", "-f", help="Output format (text, json, jsonschema, md)"
    ),
    sketch_path: Path | None = typer.Option(
        None, "--sketch-path", help="Additional sketch directory"
    ),
):
    """Show schema details."""
    console = get_console()

    registry = get_registry()
    registry.discover_builtin()
    if sketch_path:
        registry.discover_path(sketch_path)

    # Register schemas
    register_sketch_schemas()

    sketch_info = registry.get(name)
    if not sketch_info:
        print_error(f"Sketch '{name}' not found.")
        raise typer.Exit(1)

    # Try new schema system first
    schema_registry = get_schema_registry()
    schema = schema_registry.get(name)

    if not schema:
        # Fall back to old param_space
        if sketch_info.param_space_func:
            param_space = sketch_info.param_space_func()
            console.print(
                "[yellow]Note: Using legacy param_space. Consider migrating to get_schema().[/yellow]\n"
            )
            # Convert to schema format for display
            from numbrane_python.params.schema import ParamSchema

            schema = ParamSchema(
                name=name,
                params=param_space.params.values() if hasattr(param_space, "params") else [],
                description=f"Schema for {name}",
            )
        else:
            print_error(f"Sketch '{name}' does not expose a schema.")
            raise typer.Exit(1)

    if format == "json":
        data = {
            "name": schema.name,
            "description": schema.description,
            "version": schema.version,
            "params": [p.to_dict() for p in schema.params],
        }
        console.print(json.dumps(data, indent=2))
    elif format == "jsonschema":
        json_schema = export_schema_json(schema)
        console.print(json.dumps(json_schema, indent=2))
    elif format == "md":
        markdown = export_schema_markdown(schema)
        console.print(markdown)
    else:
        # Text format
        console.print(f"\n[bold]Schema: {schema.name}[/bold]\n")
        console.print(f"{schema.description}\n")
        console.print("[bold]Parameters:[/bold]")

        data = []
        for param in sorted(schema.params, key=lambda p: p.path):
            param_dict = param.to_dict()
            type_info = param_dict.get("type", "unknown")
            default = str(param_dict.get("default", ""))
            desc = param_dict.get("description", "")

            # Add range/choices info
            if hasattr(param, "min_val") and hasattr(param, "max_val"):
                type_info += f" [{param.min_val}, {param.max_val}]"
            elif hasattr(param, "choices"):
                type_info += f" {param.choices}"

            data.append([param.path, type_info, default, desc])

        print_table(data, ["Path", "Type", "Default", "Description"])

        if schema.constraints:
            console.print("\n[bold]Constraints:[/bold]")
            for constraint in schema.constraints:
                console.print(f"  • {constraint.description}")


@schema_app.command("template")
def schema_template(
    name: str = typer.Argument(..., help="Schema name"),
    preset: str | None = typer.Option(None, "--preset", "-p", help="Preset name"),
    out: Path | None = typer.Option(None, "--out", "-o", help="Output file (default: stdout)"),
    sketch_path: Path | None = typer.Option(
        None, "--sketch-path", help="Additional sketch directory"
    ),
):
    """Generate config template from schema."""
    console = get_console()

    registry = get_registry()
    registry.discover_builtin()
    if sketch_path:
        registry.discover_path(sketch_path)

    # Register schemas
    register_sketch_schemas()

    sketch_info = registry.get(name)
    if not sketch_info:
        print_error(f"Sketch '{name}' not found.")
        raise typer.Exit(1)

    # Get defaults
    schema_registry = get_schema_registry()
    defaults = schema_registry.get_defaults(name)

    if not defaults:
        # Try to get from sketch
        if hasattr(sketch_info.module, "defaults"):
            defaults = sketch_info.module.defaults()
        elif sketch_info.config_class:
            config = sketch_info.config_class()
            defaults = config.model_dump() if hasattr(config, "model_dump") else {}
        else:
            print_error(f"Could not get defaults for '{name}'.")
            raise typer.Exit(1)

    # Apply preset if specified
    if preset:
        presets_dict = schema_registry.get_presets(name)
        if preset in presets_dict:
            defaults.update(presets_dict[preset])
        else:
            print_error(f"Preset '{preset}' not found.")
            raise typer.Exit(1)

    # Generate YAML with comments
    yaml_lines = ["# Configuration template for " + name]
    if preset:
        yaml_lines.append(f"# Preset: {preset}")
    yaml_lines.append("")

    # Add parameters with comments
    def add_params(d: dict, indent: int = 0):
        """Recursively add params with comments."""
        for key, value in sorted(d.items()):
            prefix = "  " * indent
            if isinstance(value, dict):
                yaml_lines.append(f"{prefix}{key}:")
                add_params(value, indent + 1)
            else:
                yaml_lines.append(f"{prefix}{key}: {value}  # TODO: adjust")

    add_params(defaults)

    yaml_content = "\n".join(yaml_lines)

    if out:
        out_path = Path(out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w") as f:
            f.write(yaml_content)
        print_success(f"Template saved to {out_path}")
    else:
        console.print(yaml_content)


@schema_app.command("validate")
def schema_validate(
    config: Path = typer.Argument(..., help="Config file to validate"),
    name: str | None = typer.Option(
        None, "--name", "-n", help="Schema name (auto-detect if not specified)"
    ),
    sketch_path: Path | None = typer.Option(
        None, "--sketch-path", help="Additional sketch directory"
    ),
):
    """Validate config against schema."""
    console = get_console()

    config_path = Path(config)
    if not config_path.exists():
        print_error(f"Config file {config_path} not found.")
        raise typer.Exit(1)

    # Load config
    with open(config_path) as f:
        if config_path.suffix in [".yaml", ".yml"]:
            config_dict = yaml.safe_load(f)
        else:
            config_dict = json.load(f)

    # Get schema name
    if not name:
        # Try to infer from config
        name = config_dict.get("_sketch") or config_dict.get("sketch")
        if not name:
            print_error("Could not determine schema name. Use --name.")
            raise typer.Exit(1)

    registry = get_registry()
    registry.discover_builtin()
    if sketch_path:
        registry.discover_path(sketch_path)

    # Register schemas
    register_sketch_schemas()

    sketch_info = registry.get(name)
    if not sketch_info:
        print_error(f"Sketch '{name}' not found.")
        raise typer.Exit(1)

    # Get schema
    schema_registry = get_schema_registry()
    schema = schema_registry.get(name)

    if not schema:
        print_error(f"Schema for '{name}' not found.")
        raise typer.Exit(1)

    # Validate
    is_valid, violations = validate_params(schema, config_dict)

    if is_valid:
        print_success("Config is valid!")

        # Show canonical hash
        canonical = canonicalize_params(config_dict)
        hash_short = param_hash_short(canonical)
        console.print(f"[dim]Param hash: {hash_short}[/dim]")
    else:
        print_error(f"Config has {len(violations)} validation error(s):")
        for violation in violations:
            console.print(f"  [red]✗[/red] {violation.path}: {violation.message}")
            if violation.expected:
                console.print(f"    Expected: {violation.expected}")
            if violation.actual is not None:
                console.print(f"    Actual: {violation.actual}")
            if violation.suggestion:
                console.print(f"    Suggestion: {violation.suggestion}")
        raise typer.Exit(1)


@schema_app.command("sample")
def schema_sample(
    name: str = typer.Argument(..., help="Schema name"),
    n: int = typer.Option(25, "--n", "-n", help="Number of samples"),
    seed: int = typer.Option(42, "--seed", "-s", help="Random seed"),
    strategy: str = typer.Option(
        "random", "--strategy", help="Sampling strategy (random, latin, sobol, meta_sweep)"
    ),
    out: Path = typer.Option(Path("samples"), "--out", "-o", help="Output directory"),
    format: str = typer.Option("yaml", "--format", "-f", help="Config format (yaml, json)"),
    meta: str | None = typer.Option(
        None, "--meta", help="Meta-controls (e.g., 'violence=0.7,entropy=0.5')"
    ),
    render_thumbs: bool = typer.Option(
        False, "--render-thumbs", help="Render thumbnails for samples"
    ),
    record: bool = typer.Option(False, "--record", help="Record samples in lab"),
    sketch_path: Path | None = typer.Option(
        None, "--sketch-path", help="Additional sketch directory"
    ),
):
    """Sample parameter configurations from schema."""
    console = get_console()

    registry = get_registry()
    registry.discover_builtin()
    if sketch_path:
        registry.discover_path(sketch_path)

    # Register schemas
    register_sketch_schemas()

    sketch_info = registry.get(name)
    if not sketch_info:
        print_error(f"Sketch '{name}' not found.")
        raise typer.Exit(1)

    # Get schema
    schema_registry = get_schema_registry()
    schema = schema_registry.get(name)

    if not schema:
        print_error(f"Schema for '{name}' not found.")
        raise typer.Exit(1)

    # Parse meta-controls if provided
    meta_dict = {}
    if meta:
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

    # Sample based on strategy
    from numbrane_python.meta.resolver import MetaResolver
    from numbrane_python.params.sampler import LatinHypercubeSampler, RandomSampler

    out_path = Path(out)
    out_path.mkdir(parents=True, exist_ok=True)

    console.print(f"[bold]Sampling {n} configurations with {strategy}...[/bold]")

    if strategy == "latin":
        sampler = LatinHypercubeSampler()
        samples = sampler.sample(schema, n, seed, None)
    elif strategy == "sobol":
        # Fall back to LHS for now (Sobol would need scipy)
        sampler = LatinHypercubeSampler()
        samples = sampler.sample(schema, n, seed, None)
    elif strategy == "meta_sweep" and meta_dict:
        # Sample around meta-control manifolds
        resolver = MetaResolver()
        base_config = schema_registry.get_defaults(name) or {}
        samples = []
        for i in range(n):
            # Vary meta-controls slightly
            varied_meta = {}
            rng_local = np.random.default_rng(seed + i)
            for meta_name, base_value in meta_dict.items():
                varied_meta[meta_name] = float(
                    np.clip(base_value + rng_local.normal(0, 0.1), 0.0, 1.0)
                )
            resolved, _ = resolver.resolve(base_config, varied_meta, schema)
            samples.append((resolved, {}))
    else:  # random
        sampler = RandomSampler()
        samples = sampler.sample(schema, n, seed, None)

    # Process samples
    for i, sample_data in enumerate(samples):
        if isinstance(sample_data, tuple):
            sampled, provenance = sample_data
        else:
            sampled = sample_data
            provenance = {}

        # Add metadata
        sampled["_sketch"] = name
        sampled["_sample_index"] = i
        sampled["_seed"] = seed + i

        # Canonicalize and hash
        canonical = canonicalize_params(sampled)
        hash_short = param_hash_short(canonical)
        sampled["_param_hash"] = hash_short

        # Save
        filename = f"{name}_sample{i:04d}_{hash_short}.{format}"
        filepath = out_path / filename

        if format == "yaml":
            with open(filepath, "w") as f:
                yaml.dump(sampled, f, default_flow_style=False, sort_keys=False)
        else:
            with open(filepath, "w") as f:
                json.dump(sampled, f, indent=2)

        # Render thumbnail if requested
        if render_thumbs:
            try:
                config_obj = sketch_info.config_class(**sampled)
                config_obj.seed = seed + i

                from PIL import Image

                from numbrane_python.core.config import Quality
                from numbrane_python.core.ctx import RenderContext
                from numbrane_python.core.rng import RNG

                rng = RNG(seed + i)
                quality = Quality(mode="preview", supersample=1)
                ctx = RenderContext(
                    rng=rng,
                    width=min(config_obj.width, 400),  # Smaller for thumbnails
                    height=min(config_obj.height, 400),
                    quality=quality,
                    output_dir=out_path,
                )

                result = sketch_info.render_func(config_obj, ctx)

                thumb_path = out_path / f"{name}_sample{i:04d}_thumb.png"
                thumb = create_thumbnail(result.image, (200, 200))
                Image.fromarray(thumb).save(thumb_path)
            except Exception as e:
                console.print(f"[yellow]Warning: Failed to render thumbnail {i}: {e}[/yellow]")

        # Record in lab if requested
        if record:
            try:
                from numbrane_python.lab.api import add_artifact

                add_artifact(
                    sketch_name=name,
                    seed=seed + i,
                    config=sampled,
                    meta_controls=meta_dict if meta_dict else None,
                    output_path=str(filepath),
                    tags=["sampled"],
                )
            except Exception as e:
                console.print(f"[yellow]Warning: Failed to record sample {i}: {e}[/yellow]")

    print_success(f"Generated {n} samples in {out_path}")


def create_thumbnail(image: np.ndarray, size: tuple[int, int] = (200, 200)) -> np.ndarray:
    """Create thumbnail from image."""
    from PIL import Image

    pil_image = Image.fromarray(image)
    pil_image.thumbnail(size, Image.Resampling.LANCZOS)
    return np.array(pil_image)


def _set_nested(d: dict, path: str, value: Any) -> None:
    """Set nested value in dictionary."""
    parts = path.split(".")
    current = d
    for part in parts[:-1]:
        if part not in current:
            current[part] = {}
        current = current[part]
    current[parts[-1]] = value
