"""Cross-language circle-lattice geometry IR contract.

Tolerance: absolute 1e-9 on floating geometry fields (documented NAP layer 3).
"""

from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
RECIPE = REPO / "pieces" / "reference" / "circle-lattice" / "recipe.json"
TOLERANCE = 1e-9


def _py_ir() -> dict:
    sys.path.insert(0, str(REPO / "engines" / "python" / "src"))
    from numbrane_python.pieces.circle_lattice import generate, normalize_geometry

    recipe = json.loads(RECIPE.read_text())
    return normalize_geometry(generate(recipe))


def _ts_ir() -> dict:
    script = REPO / "engines" / "web" / "scripts" / "emit-circle-lattice.ts"
    proc = subprocess.run(
        ["npx", "tsx", str(script), str(RECIPE)],
        cwd=REPO / "engines" / "web",
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(proc.stdout)


def _close(a: float, b: float) -> bool:
    return math.isclose(a, b, rel_tol=0.0, abs_tol=TOLERANCE)


def test_circle_lattice_geometry_parity() -> None:
    py = _py_ir()
    ts = _ts_ir()
    assert py["protocol_version"] == ts["protocol_version"]
    assert py["space"] == ts["space"] == "cartesian-2d"
    assert len(py["primitives"]) == len(ts["primitives"])
    for p, t in zip(py["primitives"], ts["primitives"], strict=True):
        assert p["kind"] == t["kind"]
        for key in ("cx", "cy", "r"):
            assert _close(float(p[key]), float(t[key])), (key, p[key], t[key])
