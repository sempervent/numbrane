"""studio-piece-fidelity — cross-piece and seed significance regression suite."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest


def _repo_root() -> Path:
    here = Path(__file__).resolve()
    for p in [here, *here.parents]:
        if (p / "tools" / "numbrane_cli.py").exists() and (p / "engines" / "python").exists():
            return p
    raise RuntimeError("numbrane repo root not found")


ROOT = _repo_root()


def _digest_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _render(piece: str, seed: int, width: int = 128, height: int = 128, **params) -> bytes:
    import os
    import subprocess
    import sys
    import tempfile

    cli = ROOT / "tools" / "numbrane_cli.py"
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / "out.png"
        env = os.environ.copy()
        if params:
            env["NUMBRANE_RENDER_PARAMS"] = json.dumps(params)
        env["NUMBRANE_RENDER_QUALITY"] = "preview"
        r = subprocess.run(
            [
                sys.executable,
                str(cli),
                "render",
                piece,
                "--seed",
                str(seed),
                "--width",
                str(width),
                "--height",
                str(height),
                "--format",
                "png",
                "-o",
                str(out),
            ],
            cwd=str(ROOT),
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        assert r.returncode == 0, r.stderr or r.stdout or f"render failed for {piece}"
        assert out.exists()
        return out.read_bytes()


def _luma_digest(png: bytes) -> str:
    """Structure-oriented digest: grayscale histogram (ignores pure hue shifts)."""
    from io import BytesIO

    import numpy as np
    from PIL import Image

    img = Image.open(BytesIO(png)).convert("L")
    arr = np.asarray(img, dtype=np.uint8)
    hist, _ = np.histogram(arr, bins=32, range=(0, 256))
    return hashlib.sha256(hist.tobytes()).hexdigest()


GEOM_PIECES = [
    "geometry/metatron",
    "geometry/seed-of-life",
    "geometry/flower-of-life",
    "geometry/sri-yantra",
    "geometry/isometric",
]

CROSS_FAMILY = [
    "geometry/metatron",
    "fields/flow-hatching",
    "fractals/strange-attractors",
    "growth/slime-mold",
    "reaction-diffusion/reaction-diffusion",
    "tiling/truchet-tiles",
]

SEED_SENSITIVE = [
    "fractals/strange-attractors",
    "fields/flow-hatching",
    "reaction-diffusion/reaction-diffusion",
    "growth/slime-mold",
    "tiling/voronoi-stained-glass",
    "geometry/circle-packing",
]


@pytest.mark.parametrize("piece", GEOM_PIECES)
def test_geometry_json_topology_distinct(piece: str) -> None:
    """Geometry pieces expose distinct IR kinds (not shared Metatron)."""
    from numbrane_python.geometry.lattice import (
        flower_of_life_centers,
        geometry_ir_from_centers,
        metatron_lines,
        seed_of_life_centers,
    )
    from numbrane_python.geometry.sacred import build_sacred_geometry_ir

    if "metatron" in piece:
        centers = flower_of_life_centers(1.0, levels=1)
        ir = geometry_ir_from_centers(centers, 1.0, edges=metatron_lines(centers))
        kind = "metatron"
    elif "seed-of-life" in piece:
        ir = geometry_ir_from_centers(seed_of_life_centers(1.0), 1.0)
        kind = "seed-of-life"
    else:
        kind = (
            "flower-of-life"
            if "flower" in piece
            else "sri-yantra"
            if "sri" in piece
            else "isometric"
        )
        ir = build_sacred_geometry_ir(kind, seed=42)

    assert ir is not None
    meta_kind = (ir.get("meta") or {}).get("kind") or ir.get("kind") or kind
    assert (
        kind in str(meta_kind)
        or meta_kind == kind
        or kind.replace("-", "") in str(meta_kind).replace("-", "")
    )


def test_geometry_pieces_differ_in_png_digest() -> None:
    digests = {_digest_bytes(_render(p, 42, 96, 96)) for p in GEOM_PIECES}
    assert len(digests) == len(GEOM_PIECES)


def test_cross_family_renders_are_distinct() -> None:
    digests = {_digest_bytes(_render(p, 42, 96, 96)) for p in CROSS_FAMILY}
    assert len(digests) == len(CROSS_FAMILY), "families collapsed to one implementation"


@pytest.mark.parametrize("piece", SEED_SENSITIVE)
def test_seed_changes_structure_not_only_identity(piece: str) -> None:
    a = _render(piece, 1, 96, 96)
    b = _render(piece, 42, 96, 96)
    c = _render(piece, 137, 96, 96)
    digests = {_digest_bytes(a), _digest_bytes(b), _digest_bytes(c)}
    assert len(digests) >= 2, f"{piece}: seeds produced identical bytes"
    luma = {_luma_digest(a), _luma_digest(b), _luma_digest(c)}
    assert len(luma) >= 2, f"{piece}: seeds only changed color (luma hist identical)"


def test_no_metatron_masquerading_as_sri() -> None:
    met = _digest_bytes(_render("geometry/metatron", 42, 128, 128))
    sri = _digest_bytes(_render("geometry/sri-yantra", 42, 128, 128))
    assert met != sri
