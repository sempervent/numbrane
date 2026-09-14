"""Small golden corpus — semantic snapshots, not megabyte binaries."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engines" / "python" / "src"))
GOLDEN = Path(__file__).parent / "fixtures"


def test_circle_lattice_golden() -> None:
    from numbrane_python.pieces.circle_lattice import generate, normalize_geometry

    recipe = json.loads((ROOT / "pieces/reference/circle-lattice/recipe.json").read_text())
    ir = normalize_geometry(generate(recipe))
    # Stable semantic hash of rounded geometry
    payload = json.dumps(ir, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(payload.encode()).hexdigest()
    expected_path = GOLDEN / "circle_lattice.sha256"
    if not expected_path.exists():
        expected_path.parent.mkdir(parents=True, exist_ok=True)
        expected_path.write_text(digest + "\n")
    assert digest == expected_path.read_text().strip()


def test_seed_of_life_count_golden() -> None:
    from numbrane_python.geometry.lattice import seed_of_life_centers

    assert len(seed_of_life_centers(1.0)) == 7
