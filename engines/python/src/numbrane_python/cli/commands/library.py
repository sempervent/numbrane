"""Library command implementation."""

import json
import platform
import subprocess
import sys
from pathlib import Path
from typing import List, Optional

import typer

from numbrane_python.cli.utils import (
    get_console,
    print_error,
    print_info,
    print_success,
    print_table,
)
from numbrane_python.library.api import (
    find_similar,
    get_run,
    note_run,
    register_run,
    replay_run,
    search_runs,
    tag_run,
)
from numbrane_python.library.db import get_library_db
from numbrane_python.library.paths import get_library_root, get_run_path

library_app = typer.Typer(name="library", help="Run library and curation")


@library_app.command("init")
def library_init(
    root: Path | None = typer.Option(None, "--root", help="Library root directory"),
):
    """Initialize library database and folders."""
    import os

    if root:
        os.environ["GENART_LIBRARY_ROOT"] = str(root)

    db = get_library_db()
    library_root = get_library_root()

    console = get_console()
    console.print("[bold]Library initialized[/bold]")
    console.print(f"Database: {db.db_path}")
    console.print(f"Root: {library_root}")

    print_success("Library initialized successfully")


@library_app.command("list")
def library_list(
    sketch: str | None = typer.Option(None, "--sketch", "-s", help="Filter by sketch"),
    tag: list[str] | None = typer.Option(None, "--tag", "-t", help="Filter by tag"),
    limit: int | None = typer.Option(None, "--limit", "-n", help="Maximum results"),
):
    """List runs in library."""
    db = get_library_db()

    runs = db.list_runs(sketch_name=sketch, tags=tag, limit=limit)

    if not runs:
        print_info("No runs found.")
        return

    console = get_console()
    console.print(f"\n[bold]Found {len(runs)} run(s):[/bold]\n")

    data = []
    for run in runs:
        tags_str = ", ".join(run.tags) if run.tags else ""
        title = run.title or run.run_id[:16]
        data.append(
            [
                run.run_id[:16],
                run.sketch_name,
                str(run.seed),
                title,
                tags_str,
                run.created_at.strftime("%Y-%m-%d %H:%M"),
            ]
        )

    print_table(data, ["ID", "Sketch", "Seed", "Title", "Tags", "Created"])


@library_app.command("show")
def library_show(
    run_id: str = typer.Argument(..., help="Run ID"),
):
    """Show detailed information about a run."""
    run = get_run(run_id)
    if not run:
        print_error(f"Run '{run_id}' not found.")
        raise typer.Exit(1)

    console = get_console()
    console.print(f"\n[bold]Run: {run.run_id}[/bold]\n")
    console.print(f"Sketch: {run.sketch_name}")
    console.print(f"Seed: {run.seed}")
    console.print(f"Created: {run.created_at}")
    console.print(f"Param hash: {run.param_hash}")
    console.print(f"Output: {run.output_path}")

    if run.title:
        console.print(f"\nTitle: {run.title}")
    if run.tags:
        console.print(f"Tags: {', '.join(run.tags)}")
    if run.notes:
        console.print(f"\nNotes:\n{run.notes}")

    if run.meta_controls:
        console.print("\n[bold]Meta-controls:[/bold]")
        for name, value in run.meta_controls.items():
            console.print(f"  {name}: {value:.2f}")

    if run.metrics:
        console.print("\n[bold]Metrics:[/bold]")
        console.print(f"  Edge density: {run.metrics.edge_density:.3f}")
        console.print(f"  Entropy: {run.metrics.entropy:.3f}")
        console.print(f"  Symmetry: {run.metrics.symmetry:.3f}")
        console.print(f"  Color diversity: {run.metrics.color_diversity:.3f}")
        console.print(f"  Spatial balance: {run.metrics.spatial_balance:.3f}")


@library_app.command("open")
def library_open(
    run_id: str = typer.Argument(..., help="Run ID"),
):
    """Open run output in default viewer."""
    run = get_run(run_id)
    if not run:
        print_error(f"Run '{run_id}' not found.")
        raise typer.Exit(1)

    output_path = Path(run.output_path)
    if not output_path.exists():
        print_error(f"Output file not found: {output_path}")
        raise typer.Exit(1)

    # Open based on platform
    system = platform.system()
    if system == "Darwin":  # macOS
        subprocess.run(["open", str(output_path)])
    elif system == "Linux":
        subprocess.run(["xdg-open", str(output_path)])
    elif system == "Windows":
        subprocess.run(["start", str(output_path)], shell=True)
    else:
        print_error(f"Unsupported platform: {system}")
        raise typer.Exit(1)

    print_success(f"Opened {output_path}")


@library_app.command("search")
def library_search(
    query: str = typer.Argument(..., help="Search query"),
    sort: str | None = typer.Option(
        None, "--sort", help="Sort by field (e.g., metric.symmetry)"
    ),
    limit: int | None = typer.Option(None, "--limit", "-n", help="Maximum results"),
):
    """Search library with query language."""
    try:
        runs = search_runs(query, limit=limit)
    except Exception as e:
        print_error(f"Query error: {e}")
        raise typer.Exit(1)

    if not runs:
        print_info("No runs found.")
        return

    # Sort if requested
    if sort:
        # Simple sorting by metric
        if sort.startswith("metric."):
            metric_name = sort[7:]
            runs.sort(
                key=lambda r: getattr(r.metrics, metric_name, 0.0) if r.metrics else 0.0,
                reverse=True,
            )

    console = get_console()
    console.print(f"\n[bold]Found {len(runs)} run(s):[/bold]\n")

    data = []
    for run in runs:
        title = run.title or run.run_id[:16]
        symmetry = run.metrics.symmetry if run.metrics else 0.0
        data.append(
            [
                run.run_id[:16],
                run.sketch_name,
                title,
                f"{symmetry:.2f}",
                run.created_at.strftime("%Y-%m-%d"),
            ]
        )

    print_table(data, ["ID", "Sketch", "Title", "Symmetry", "Created"])


@library_app.command("similar")
def library_similar(
    run_id: str = typer.Argument(..., help="Run ID"),
    k: int = typer.Option(12, "--k", "-k", help="Number of similar runs"),
):
    """Find similar runs."""
    try:
        similar = find_similar(run_id, k=k)
    except Exception as e:
        print_error(f"Error: {e}")
        raise typer.Exit(1)

    if not similar:
        print_info("No similar runs found.")
        return

    console = get_console()
    console.print(f"\n[bold]Similar to {run_id[:16]}:[/bold]\n")

    data = []
    for run, similarity in similar:
        title = run.title or run.run_id[:16]
        data.append(
            [
                run.run_id[:16],
                run.sketch_name,
                title,
                f"{similarity:.3f}",
            ]
        )

    print_table(data, ["ID", "Sketch", "Title", "Similarity"])


@library_app.command("tag")
def library_tag(
    run_id: str = typer.Argument(..., help="Run ID"),
    action: str = typer.Argument(..., help="Action (add, remove, set)"),
    tags: list[str] = typer.Argument(..., help="Tags"),
):
    """Manage tags for a run."""
    try:
        tag_run(run_id, tags, mode=action)
        print_success(f"Tags updated for {run_id[:16]}")
    except Exception as e:
        print_error(f"Error: {e}")
        raise typer.Exit(1)


@library_app.command("note")
def library_note(
    run_id: str = typer.Argument(..., help="Run ID"),
    action: str = typer.Argument(..., help="Action (set, edit)"),
    note: str | None = typer.Option(None, "--text", "-t", help="Note text"),
):
    """Manage notes for a run."""
    if not note:
        # Interactive edit
        run = get_run(run_id)
        if not run:
            print_error(f"Run '{run_id}' not found.")
            raise typer.Exit(1)

        from numbrane_python.library.paths import get_notes_path

        notes_path = get_notes_path(run_id)

        # Open editor
        editor = os.getenv("EDITOR", "nano")
        subprocess.run([editor, str(notes_path)])

        # Read back
        if notes_path.exists():
            note = notes_path.read_text()
            note_run(run_id, note, mode="set")
            print_success("Notes updated")
    else:
        try:
            note_run(run_id, note, mode=action)
            print_success(f"Notes updated for {run_id[:16]}")
        except Exception as e:
            print_error(f"Error: {e}")
            raise typer.Exit(1)


@library_app.command("replay")
def library_replay(
    run_id: str = typer.Argument(..., help="Run ID"),
    verify: bool = typer.Option(True, "--verify/--no-verify", help="Verify determinism"),
):
    """Replay a run and verify determinism."""
    try:
        result = replay_run(run_id, verify=verify)

        console = get_console()
        if result["matches"]:
            print_success(result["message"])
        else:
            print_error(result["message"])
            if "original_hash" in result:
                console.print(f"Original: {result['original_hash']}")
                console.print(f"Replayed: {result['replayed_hash']}")
    except Exception as e:
        print_error(f"Error: {e}")
        raise typer.Exit(1)


@library_app.command("export")
def library_export(
    run_id: str = typer.Argument(..., help="Run ID"),
    out: Path = typer.Option(Path("."), "--out", "-o", help="Output directory"),
    zip: bool = typer.Option(False, "--zip", help="Create ZIP archive"),
):
    """Export run as portable artifact."""
    run = get_run(run_id)
    if not run:
        print_error(f"Run '{run_id}' not found.")
        raise typer.Exit(1)

    run_path = get_run_path(run_id)

    if zip:
        import zipfile

        zip_path = out / f"{run_id}.zip"
        with zipfile.ZipFile(zip_path, "w") as zf:
            for file in run_path.rglob("*"):
                if file.is_file():
                    zf.write(file, file.relative_to(run_path.parent))
        print_success(f"Exported to {zip_path}")
    else:
        # Copy to output directory
        import shutil

        dest = out / run_id
        shutil.copytree(run_path, dest, dirs_exist_ok=True)
        print_success(f"Exported to {dest}")


@library_app.command("curate")
def library_curate(
    goal: str = typer.Argument(
        ..., help="Goal description (e.g., 'high cosmicness, low rigidity')"
    ),
    k: int = typer.Option(24, "--k", "-k", help="Number of results"),
    out: Path = typer.Option(Path("curated.html"), "--out", "-o", help="Output HTML file"),
):
    """Curate library items by goal."""
    # Parse goal into meta-control targets
    goal_lower = goal.lower()
    meta_targets = {}

    # Simple parsing
    if "high cosmicness" in goal_lower or "cosmicness" in goal_lower:
        meta_targets["cosmicness"] = 0.8
    if "low rigidity" in goal_lower:
        meta_targets["rigidity"] = 0.2
    if "high symmetry" in goal_lower:
        meta_targets["symmetry"] = 0.8
    if "low entropy" in goal_lower:
        meta_targets["entropy"] = 0.2

    # Search and rank
    db = get_library_db()
    all_runs = db.list_runs(limit=1000)  # Get many runs

    # Score by goal
    scored = []
    for run in all_runs:
        score = 0.0
        for meta_name, target_value in meta_targets.items():
            run_value = run.meta_controls.get(meta_name, 0.5)
            # Distance from target (closer = better)
            distance = abs(run_value - target_value)
            score += 1.0 - distance

        # Also consider metrics
        if run.metrics:
            if "symmetry" in goal_lower and "high" in goal_lower:
                score += run.metrics.symmetry

        scored.append((run, score))

    # Sort by score
    scored.sort(key=lambda x: x[1], reverse=True)

    # Generate HTML
    html_lines = [
        "<!DOCTYPE html>",
        "<html><head><title>Curated Gallery</title>",
        "<style>",
        "body { font-family: sans-serif; padding: 20px; }",
        ".gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }",
        ".item { border: 1px solid #ccc; padding: 10px; }",
        ".item img { width: 100%; height: auto; }",
        "</style>",
        "</head><body>",
        f"<h1>Curated: {goal}</h1>",
        f"<p>Top {k} results</p>",
        "<div class='gallery'>",
    ]

    for run, score in scored[:k]:
        html_lines.append("<div class='item'>")
        html_lines.append(f"<img src='{run.thumb_path}' alt='{run.run_id}'>")
        html_lines.append(f"<p>{run.sketch_name} (score: {score:.2f})</p>")
        html_lines.append("</div>")

    html_lines.extend(["</div>", "</body></html>"])

    out.write_text("\n".join(html_lines))
    print_success(f"Curated gallery saved to {out}")


import os
