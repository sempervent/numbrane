"""Schema validation for NAP examples."""

from __future__ import annotations

import json
from pathlib import Path

import jsonschema
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

REPO = Path(__file__).resolve().parents[3]
SCHEMA_DIR = REPO / "spec" / "schema"
EXAMPLES = REPO / "tests" / "fixtures" / "examples"


def _registry() -> Registry:
    registry = Registry()
    for path in SCHEMA_DIR.glob("*.schema.json"):
        schema = json.loads(path.read_text())
        resource = Resource.from_contents(schema, default_specification=DRAFT202012)
        registry = registry.with_resource(path.name, resource)
        if "$id" in schema:
            registry = registry.with_resource(schema["$id"], resource)
    return registry


def _validate(schema_name: str, instance_path: Path) -> None:
    schema = json.loads((SCHEMA_DIR / schema_name).read_text())
    instance = json.loads(instance_path.read_text())
    validator = jsonschema.Draft202012Validator(schema, registry=_registry())
    validator.validate(instance)


def test_manifest_example() -> None:
    _validate("manifest.schema.json", EXAMPLES / "manifest.circle-lattice.json")


def test_recipe_example() -> None:
    _validate("recipe.schema.json", EXAMPLES / "recipe.circle-lattice.json")


def test_event_example() -> None:
    _validate("event.schema.json", EXAMPLES / "event.pointer.json")


def test_telemetry_example() -> None:
    _validate("telemetry.schema.json", EXAMPLES / "telemetry.sample.json")


def test_piece_manifests() -> None:
    _validate(
        "manifest.schema.json",
        REPO / "pieces" / "reference" / "circle-lattice" / "manifest.json",
    )
    _validate(
        "recipe.schema.json",
        REPO / "pieces" / "reference" / "circle-lattice" / "recipe.json",
    )
