"""Python engine unit tests."""

from __future__ import annotations

import json
from pathlib import Path

from numbrane_python.rng import Rng, expand_seed

REPO = Path(__file__).resolve().parents[3]
VECTORS = REPO / "spec" / "rng" / "vectors.json"


def test_rng_vectors() -> None:
    data = json.loads(VECTORS.read_text())
    for case in data["cases"]:
        seed = case["seed"]
        assert list(expand_seed(seed)) == case["state0"]
        rng = Rng(seed)
        for expected in case["u32"]:
            assert rng.random_u32() == expected
        rng = Rng(seed)
        for expected in case["f64"]:
            got = rng.random_f64()
            assert abs(got - expected) < 1e-15


def test_circle_lattice_deterministic() -> None:
    from numbrane_python.pieces.circle_lattice import generate, normalize_geometry

    recipe_path = REPO / "pieces" / "reference" / "circle-lattice" / "recipe.json"
    recipe = json.loads(recipe_path.read_text())
    a = normalize_geometry(generate(recipe))
    b = normalize_geometry(generate(recipe))
    assert a == b
    assert len(a["primitives"]) == 7  # center + 6
