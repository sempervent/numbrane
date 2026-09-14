"""Doctor command implementation."""

import platform
import subprocess
import sys
from pathlib import Path
from typing import List, Tuple

import typer

from numbrane_python.cli.utils import (
    get_console,
    print_error,
    print_info,
    print_success,
    print_table,
    print_warning,
)
from numbrane_python.core.registry import get_registry


def cmd_doctor():
    """Verify installation, plugin discovery, and system capabilities."""
    console = get_console()
    console.print("\n[bold]GenArt Framework Health Check[/bold]\n")

    issues: list[tuple[str, str, bool]] = []  # (check, status, is_error)

    # Check Python version
    python_version = sys.version_info
    if python_version >= (3, 11):
        print_success(
            f"Python {python_version.major}.{python_version.minor}.{python_version.micro}"
        )
    else:
        issues.append(
            (
                "Python version",
                f"3.11+ required, found {python_version.major}.{python_version.minor}",
                True,
            )
        )
        print_error(f"Python {python_version.major}.{python_version.minor} (3.11+ required)")

    # Check core dependencies
    try:
        import numpy

        print_success(f"numpy {numpy.__version__}")
    except ImportError:
        issues.append(("numpy", "Not installed", True))
        print_error("numpy not installed")

    try:
        import pydantic

        print_success(f"pydantic {pydantic.__version__}")
    except ImportError:
        issues.append(("pydantic", "Not installed", True))
        print_error("pydantic not installed")

    try:
        from PIL import Image

        print_success("Pillow installed")
    except ImportError:
        issues.append(("Pillow", "Not installed", True))
        print_error("Pillow not installed")

    # Check optional dependencies
    try:
        import typer

        print_success("typer installed (CLI enhanced)")
    except ImportError:
        print_warning("typer not installed (using basic CLI)")

    try:
        import rich

        print_success("rich installed (enhanced output)")
    except ImportError:
        print_warning("rich not installed (basic output)")

    # Check GPU extras
    try:
        import moderngl

        print_success("moderngl installed (GPU backend available)")
    except ImportError:
        print_info("moderngl not installed (GPU backend unavailable)")

    # Check ffmpeg
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            print_success("ffmpeg available (MP4 export supported)")
        else:
            print_warning("ffmpeg not found (MP4 export unavailable, GIF fallback)")
    except FileNotFoundError:
        print_warning("ffmpeg not found (MP4 export unavailable, GIF fallback)")

    # Check plugin discovery
    registry = get_registry()
    registry.discover_builtin()
    sketches = registry.list()

    if sketches:
        print_success(f"Discovered {len(sketches)} sketch(es)")
        for sketch_name in sketches[:5]:  # Show first 5
            print_info(f"  - {sketch_name}")
        if len(sketches) > 5:
            print_info(f"  ... and {len(sketches) - 5} more")
    else:
        issues.append(("Plugin discovery", "No sketches found", True))
        print_error("No sketches discovered")

    # Check write permissions
    test_dir = Path.cwd() / "out"
    try:
        test_dir.mkdir(parents=True, exist_ok=True)
        test_file = test_dir / ".test_write"
        test_file.write_text("test")
        test_file.unlink()
        print_success("Write permissions OK")
    except Exception as e:
        issues.append(("Write permissions", str(e), True))
        print_error(f"Write permissions issue: {e}")

    # Determinism self-check
    try:
        from numbrane_python.core.config import Quality
        from numbrane_python.core.ctx import RenderContext
        from numbrane_python.core.rng import RNG

        rng1 = RNG(42)
        rng2 = RNG(42)
        if rng1.random() == rng2.random():
            print_success("RNG determinism check passed")
        else:
            issues.append(("RNG determinism", "Failed", True))
            print_error("RNG determinism check failed")
    except Exception as e:
        issues.append(("RNG determinism", str(e), False))
        print_warning(f"Could not verify RNG determinism: {e}")

    # System info
    console.print("\n[bold]System Information:[/bold]")
    console.print(f"  Platform: {platform.system()} {platform.release()}")
    console.print(f"  Architecture: {platform.machine()}")

    # Summary
    console.print("\n[bold]Summary:[/bold]")
    if issues:
        error_count = sum(1 for _, _, is_err in issues if is_err)
        warning_count = len(issues) - error_count

        if error_count > 0:
            print_error(f"{error_count} error(s) found")
        if warning_count > 0:
            print_warning(f"{warning_count} warning(s)")

        if error_count > 0:
            console.print("\n[bold]Issues:[/bold]")
            for check, status, is_err in issues:
                if is_err:
                    console.print(f"  [red]✗[/red] {check}: {status}")
                else:
                    console.print(f"  [yellow]⚠[/yellow] {check}: {status}")

        if error_count > 0:
            console.print("\n[bold red]Please fix errors before using numbrane_python.[/bold red]")
            raise typer.Exit(1)
    else:
        print_success("All checks passed!")
        console.print("\n[bold green]GenArt is ready to use![/bold green]")
