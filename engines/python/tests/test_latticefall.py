"""LATTICEFALL Python world-builder and seed-stream contracts."""

from __future__ import annotations

import json
import math
from pathlib import Path

from numbrane_python.pieces.latticefall import build_world
from numbrane_python.seed_streams import STREAM_NAMES, derive_streams, stream_seed

REPO = Path(__file__).resolve().parents[3]
FIXTURE = REPO / "tests" / "fixtures" / "latticefall" / "world_seed42.json"
DEFAULT_RECIPE = REPO / "pieces" / "flagship" / "latticefall" / "recipe.default.json"


def _seed42_recipe() -> dict:
    recipe = json.loads(DEFAULT_RECIPE.read_text())
    recipe["seed"] = 42
    return recipe


def test_seed_streams_stable() -> None:
    a = derive_streams(42)
    b = derive_streams(42)
    assert a == b
    assert set(a) == set(STREAM_NAMES)
    # Order independence: single-name draw matches full map
    for name in STREAM_NAMES:
        assert stream_seed(42, name) == a[name]
    # Different names differ for this seed (collision would be exceptional)
    assert len(set(a.values())) == len(STREAM_NAMES)


def test_build_world_deterministic() -> None:
    recipe = _seed42_recipe()
    w1 = build_world(recipe)
    w2 = build_world(recipe)
    assert w1 == w2
    assert w1["seed"] == 42
    assert w1["piece_id"] == "flagship/latticefall"
    assert list(w1["streams"]) == list(STREAM_NAMES)


def test_geometry_node_count() -> None:
    world = build_world(_seed42_recipe())
    assert len(world["geometry"]["nodes"]) > 1
    assert world["geometry"]["nodes"][0]["id"] == "n-0000"
    assert len(world["geometry"]["edges"]) >= 1
    assert "primitives" in world["geometry"]["ir"]


def test_field_summary_finite() -> None:
    summary = build_world(_seed42_recipe())["field"]["summary"]
    assert math.isfinite(summary["mean_mag"])
    assert math.isfinite(summary["max_mag"])
    assert summary["max_mag"] >= summary["mean_mag"] >= 0.0


def test_write_contract_fixture_once() -> None:
    world = build_world(_seed42_recipe())
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    if not FIXTURE.exists():
        FIXTURE.write_text(json.dumps(world, indent=2, sort_keys=True) + "\n")
    stored = json.loads(FIXTURE.read_text())
    assert stored["seed"] == 42
    assert stored["streams"] == world["streams"]
    assert len(stored["geometry"]["nodes"]) == len(world["geometry"]["nodes"])
