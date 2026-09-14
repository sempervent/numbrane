"""LATTICEFALL cross-language contract (Python side)."""

from __future__ import annotations

import json
from pathlib import Path

from numbrane_python.pieces.latticefall import build_world
from numbrane_python.seed_streams import derive_streams

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "tests" / "fixtures" / "latticefall" / "world_seed42.json"
RECIPE = ROOT / "pieces" / "flagship" / "latticefall" / "recipe.default.json"


def test_streams_match_fixture() -> None:
    world = json.loads(FIXTURE.read_text())
    streams = derive_streams(42)
    assert world["seed"] == 42
    assert world["streams"] == streams
    assert len(world["geometry"]["nodes"]) == 19
    assert world["streams"]["geometry"] == 1225911174


def test_build_world_reproducible() -> None:
    recipe = json.loads(RECIPE.read_text())
    a = build_world(recipe)
    b = build_world(recipe)
    assert a["streams"] == b["streams"]
    assert [n["id"] for n in a["geometry"]["nodes"]] == [
        n["id"] for n in b["geometry"]["nodes"]
    ]
    assert a["field"]["summary"]["mean_mag"] == b["field"]["summary"]["mean_mag"]


def test_node_ids_stable() -> None:
    recipe = json.loads(RECIPE.read_text())
    world = build_world(recipe)
    ids = [n["id"] for n in world["geometry"]["nodes"]]
    assert ids[0] == "n-0000"
    assert len(set(ids)) == len(ids)
