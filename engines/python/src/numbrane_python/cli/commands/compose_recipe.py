"""Recipe composition commands."""

import json
from pathlib import Path
from typing import Optional

import typer

# Import existing compose app to add recipe commands
from numbrane_python.cli.commands.compose import compose_app
from numbrane_python.cli.utils import (
    get_console,
    print_error,
    print_info,
    print_success,
    print_table,
)
from numbrane_python.compose.compat import CompatibilityChecker
from numbrane_python.compose.recipe import load_recipe
from numbrane_python.compose.runner import RecipeRunner


@compose_app.command("check")
def compose_check(
    recipe: Path = typer.Argument(..., help="Recipe file path"),
    policy: str = typer.Option(
        None, "--policy", help="Override compatibility policy (strict|warn|autofix)"
    ),
    json_output: bool = typer.Option(False, "--json", help="JSON output"),
):
    """Check recipe compatibility."""
    console = get_console()

    try:
        # Load recipe
        recipe_obj = load_recipe(str(recipe))

        # Override policy if specified
        if policy:
            recipe_obj.compat.policy = policy

        # Run compatibility check
        checker = CompatibilityChecker(recipe_obj)
        report = checker.check()

        if json_output:
            print(json.dumps(report.to_dict(), indent=2))
            return

        # Human-readable report
        console.print(f"\n[bold]Compatibility Report: {recipe_obj.name}[/bold]\n")

        if not report.issues:
            print_success("No compatibility issues found!")
            return

        # Group issues by severity
        errors = [i for i in report.issues if i.severity.value == "ERROR"]
        warnings = [i for i in report.issues if i.severity.value == "WARN"]
        infos = [i for i in report.issues if i.severity.value == "INFO"]

        if errors:
            console.print(f"[red]Errors: {len(errors)}[/red]")
            for issue in errors:
                console.print(f"  [red]✗[/red] [{issue.code}] {issue.message}")
                if issue.affected_sketches:
                    console.print(f"    Affected: {', '.join(issue.affected_sketches)}")
                if issue.recommended_fix:
                    console.print(f"    Fix: {issue.recommended_fix}")

        if warnings:
            console.print(f"\n[yellow]Warnings: {len(warnings)}[/yellow]")
            for issue in warnings:
                console.print(f"  [yellow]⚠[/yellow] [{issue.code}] {issue.message}")
                if issue.affected_sketches:
                    console.print(f"    Affected: {', '.join(issue.affected_sketches)}")
                if issue.recommended_fix:
                    console.print(f"    Fix: {issue.recommended_fix}")
                if issue.autofix_applied:
                    console.print("    [dim]Autofix applied[/dim]")

        if infos:
            console.print(f"\n[dim]Info: {len(infos)}[/dim]")
            for issue in infos:
                console.print(f"  [dim]ℹ[/dim] [{issue.code}] {issue.message}")

        # Summary
        if report.has_errors:
            print_error("Recipe has errors and may not render correctly")
            raise typer.Exit(1)
        elif report.has_warnings:
            console.print("\n[yellow]Recipe has warnings but should render[/yellow]")
        else:
            print_success("Recipe is compatible!")

        # Show autofix summary
        if report.provenance_deltas:
            console.print("\n[bold]Autofixes Applied:[/bold]")
            for delta in report.provenance_deltas:
                console.print(f"  • {delta.get('type', 'unknown')}: {delta.get('issue', 'N/A')}")

    except Exception as e:
        print_error(f"Error checking recipe: {e}")
        raise typer.Exit(1)


@compose_app.command("render")
def compose_render(
    recipe: Path = typer.Argument(..., help="Recipe file path"),
    out: Path = typer.Option(Path("output.png"), "--out", "-o", help="Output file path"),
    preset: str | None = typer.Option(None, "--preset", help="Preset name to use"),
):
    """Render recipe composition."""
    console = get_console()

    try:
        # Load recipe
        recipe_obj = load_recipe(str(recipe))

        # Apply preset if specified
        if preset and recipe_obj.presets:
            preset_data = next((p for p in recipe_obj.presets if p.get("name") == preset), None)
            if preset_data:
                # Apply preset overrides
                # Simplified: would merge preset into recipe
                console.print(f"[dim]Using preset: {preset}[/dim]")
            else:
                print_error(f"Preset '{preset}' not found")
                raise typer.Exit(1)

        # Run compatibility check first
        checker = CompatibilityChecker(recipe_obj)
        report = checker.check()

        if report.has_errors and recipe_obj.compat.policy == "strict":
            print_error("Recipe has errors and policy is strict")
            raise typer.Exit(1)

        # Use resolved recipe if autofix was applied
        if report.resolved_recipe:
            recipe_obj = report.resolved_recipe
            console.print("[dim]Using autofixed recipe[/dim]")

        # Execute recipe
        console.print(f"[bold]Rendering composition: {recipe_obj.name}[/bold]")
        runner = RecipeRunner(recipe_obj)
        result = runner.run(output_path=out)

        # Save output
        result.save(out)

        print_success(f"Rendered to {out}")
        console.print(f"[dim]Seed: {result.seed}[/dim]")
        console.print(f"[dim]Recipe hash: {runner.provenance.get('recipe_hash', 'N/A')}[/dim]")

    except Exception as e:
        print_error(f"Error rendering recipe: {e}")
        raise typer.Exit(1)


@compose_app.command("animate")
def compose_animate(
    recipe: Path = typer.Argument(..., help="Recipe file path"),
    out: Path = typer.Option(Path("output.mp4"), "--out", "-o", help="Output file path"),
    preset: str | None = typer.Option(None, "--preset", help="Preset name to use"),
):
    """Animate recipe composition."""
    console = get_console()

    try:
        # Load recipe
        recipe_obj = load_recipe(str(recipe))

        if not recipe_obj.composite.time or recipe_obj.composite.time.frames <= 1:
            print_error("Recipe does not specify animation (time.frames > 1)")
            raise typer.Exit(1)

        # Check compatibility
        checker = CompatibilityChecker(recipe_obj)
        report = checker.check()

        if report.has_errors and recipe_obj.compat.policy == "strict":
            print_error("Recipe has errors and policy is strict")
            raise typer.Exit(1)

        if report.resolved_recipe:
            recipe_obj = report.resolved_recipe

        # Execute animation
        console.print(f"[bold]Animating composition: {recipe_obj.name}[/bold]")

        frames = recipe_obj.composite.time.frames
        fps = recipe_obj.composite.time.fps or 30

        # Render frames
        frames_list = []
        for frame_idx in range(frames):
            time = frame_idx / max(frames - 1, 1)
            console.print(f"[dim]Frame {frame_idx + 1}/{frames}[/dim]")

            # Create frame-specific recipe (with time)
            frame_recipe = recipe_obj.model_copy(deep=True)
            # Apply time-based meta trajectories if specified
            if recipe_obj.composite.time.meta_trajectories:
                for meta_name, trajectory in recipe_obj.composite.time.meta_trajectories.items():
                    if frame_recipe.meta:
                        frame_recipe.meta[meta_name] = trajectory[
                            min(int(time * len(trajectory)), len(trajectory) - 1)
                        ]

            runner = RecipeRunner(frame_recipe)
            result = runner.run()
            frames_list.append(result.image)

        # Save animation
        if out.suffix == ".mp4":
            import imageio

            imageio.mimwrite(str(out), frames_list, fps=fps)
        elif out.suffix == ".gif":
            import imageio

            imageio.mimwrite(str(out), frames_list, fps=fps)
        else:
            print_error(f"Unsupported animation format: {out.suffix}")
            raise typer.Exit(1)

        print_success(f"Animated to {out}")

    except Exception as e:
        print_error(f"Error animating recipe: {e}")
        raise typer.Exit(1)
