"""Intent parsing commands."""

import json
from pathlib import Path
from typing import Optional

import typer

from numbrane_python.cli.utils import get_console, print_error, print_info, print_success
from numbrane_python.interpret.parser import IntentParser
from numbrane_python.interpret.taste import TasteProfileStore, create_profile_from_intent

_DEFAULT_DB = Path(".numbrane/numbrane.sqlite")

intent_app = typer.Typer(name="interpret", help="Intent interpretation")


@intent_app.command("parse")
def parse_intent(
    intent: str = typer.Argument(..., help="Intent text to parse"),
    json_output: bool = typer.Option(False, "--json", help="JSON output"),
):
    """Parse intent text into meta-controls."""
    parser = IntentParser()
    result = parser.parse(intent)

    if json_output:
        print(
            json.dumps(
                {
                    "meta": result.meta,
                    "confidence": result.confidence,
                    "explanation": result.explanation,
                },
                indent=2,
            )
        )
    else:
        console = get_console()
        console.print(f"[bold]Intent:[/bold] {intent}")
        console.print("\n[bold]Resolved Meta-Controls:[/bold]")
        for control, value in sorted(result.meta.items()):
            console.print(f"  {control}: {value:.3f}")

        if result.explanation.get("applied_deltas"):
            console.print("\n[bold]Applied Deltas:[/bold]")
            for control, delta in sorted(result.explanation["applied_deltas"].items()):
                sign = "+" if delta >= 0 else ""
                console.print(f"  {control}: {sign}{delta:.3f}")

        if result.explanation.get("phrase_effects"):
            console.print("\n[bold]Phrase Effects:[/bold]")
            for phrase, controls in result.explanation["phrase_effects"].items():
                console.print(f"  '{phrase}': {', '.join(controls)}")


taste_app = typer.Typer(name="taste", help="Taste profile management")


@taste_app.command("list")
def list_taste_profiles(
    json_output: bool = typer.Option(False, "--json", help="JSON output"),
):
    """List all taste profiles."""
    store = TasteProfileStore(_DEFAULT_DB)
    profiles = store.list()

    if json_output:
        print(json.dumps(profiles, indent=2))
    else:
        console = get_console()
        if profiles:
            console.print("[bold]Taste Profiles:[/bold]")
            for name in profiles:
                profile = store.get(name)
                console.print(f"  • {name}: {profile.description or '(no description)'}")
        else:
            console.print("[yellow]No taste profiles found.[/yellow]")


@taste_app.command("show")
def show_taste_profile(
    name: str = typer.Argument(..., help="Profile name"),
    json_output: bool = typer.Option(False, "--json", help="JSON output"),
):
    """Show taste profile details."""
    store = TasteProfileStore(_DEFAULT_DB)
    profile = store.get(name)

    if not profile:
        print_error(f"Taste profile '{name}' not found")
        raise typer.Exit(1)

    if json_output:
        print(json.dumps(profile.to_dict(), indent=2))
    else:
        console = get_console()
        console.print(f"[bold]Taste Profile: {name}[/bold]")
        console.print(f"Description: {profile.description}")
        console.print(f"Created: {profile.created_at}")
        console.print("\n[bold]Base Meta-Controls:[/bold]")
        for control, value in sorted(profile.base_meta.items()):
            console.print(f"  {control}: {value:.3f}")

        if profile.forbidden_zones:
            console.print("\n[bold]Forbidden Zones:[/bold]")
            for control, (min_val, max_val) in profile.forbidden_zones.items():
                console.print(f"  {control}: [{min_val:.3f}, {max_val:.3f}]")


@taste_app.command("create")
def create_taste_profile(
    name: str = typer.Argument(..., help="Profile name"),
    from_intent: str | None = typer.Option(
        None, "--from-intent", help="Create from intent text"
    ),
    description: str | None = typer.Option(None, "--description", help="Profile description"),
    json_output: bool = typer.Option(False, "--json", help="JSON output"),
):
    """Create a taste profile."""
    store = TasteProfileStore(_DEFAULT_DB)

    if from_intent:
        profile = create_profile_from_intent(name, from_intent, description or "")
    else:
        from numbrane_python.interpret.taste import TasteProfile

        profile = TasteProfile(
            name=name,
            description=description or "",
            base_meta={
                "violence": 0.5,
                "entropy": 0.5,
                "symmetry": 0.5,
                "rigidity": 0.5,
                "weirdness": 0.5,
                "cosmicness": 0.5,
                "biologicalness": 0.5,
            },
        )

    store.create(profile)

    if json_output:
        print(json.dumps(profile.to_dict(), indent=2))
    else:
        print_success(f"Created taste profile '{name}'")


@taste_app.command("delete")
def delete_taste_profile(
    name: str = typer.Argument(..., help="Profile name"),
):
    """Delete a taste profile."""
    store = TasteProfileStore(_DEFAULT_DB)

    if store.delete(name):
        print_success(f"Deleted taste profile '{name}'")
    else:
        print_error(f"Taste profile '{name}' not found")
        raise typer.Exit(1)
