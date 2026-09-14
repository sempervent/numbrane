"""CLI utility functions."""

import sys
from typing import Optional

from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn, TimeElapsedColumn
from rich.table import Table
from rich.text import Text

# Global console instance
_console: Console | None = None


def setup_rich_console(verbose: bool = False, quiet: bool = False, json_mode: bool = False):
    """Setup global console instance.

    Args:
        verbose: Enable verbose output
        quiet: Suppress all output except errors
        json_mode: Output in JSON format
    """
    global _console

    if json_mode:
        _console = Console(file=sys.stderr, quiet=True)
    elif quiet:
        _console = Console(quiet=True)
    elif verbose:
        _console = Console(stderr=True)
    else:
        _console = Console()


def get_console() -> Console:
    """Get the global console instance."""
    global _console
    if _console is None:
        _console = Console()
    return _console


def print_table(data: list, headers: list, title: str | None = None):
    """Print a rich table.

    Args:
        data: List of rows (each row is a list of values)
        headers: Column headers
        title: Optional table title
    """
    table = Table(title=title, box=box.ROUNDED, show_header=True, header_style="bold magenta")

    for header in headers:
        table.add_column(header)

    for row in data:
        table.add_row(*[str(cell) for cell in row])

    get_console().print(table)


def print_success(message: str):
    """Print success message."""
    get_console().print(f"[green]✓[/green] {message}")


def print_error(message: str):
    """Print error message."""
    get_console().print(f"[red]✗[/red] {message}", err=True)


def print_warning(message: str):
    """Print warning message."""
    get_console().print(f"[yellow]⚠[/yellow] {message}")


def print_info(message: str):
    """Print info message."""
    get_console().print(f"[blue]ℹ[/blue] {message}")


def create_progress() -> Progress:
    """Create a progress bar context manager."""
    return Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
        TimeElapsedColumn(),
        console=get_console(),
    )


def print_panel(content: str, title: str | None = None, style: str = "blue"):
    """Print a rich panel."""
    get_console().print(Panel(content, title=title, style=style, box=box.ROUNDED))
