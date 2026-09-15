"""Composition grammar / PFL style / parameter-class tests (not aesthetic quality)."""

from __future__ import annotations

import numpy as np

from numbrane_python.composition.grammar import (
    apply_geometry_composition,
    background_rgb,
    composition_mask,
    framing_transform,
    parse_composition,
)
from numbrane_python.style.pfl import PFL_STYLES, apply_style_to_params, list_styles


def test_background_vocabulary():
    assert background_rgb("pure-black") == (0, 0, 0)
    assert background_rgb("warm-paper")[0] > 200
    assert background_rgb("near-black")[0] < 20


def test_composition_masks_bounded():
    for kind in ("circle", "ring", "bands", "central-void", "off-center-void", "field-threshold"):
        m = composition_mask(64, 48, kind, seed=42)
        assert m is not None
        assert m.shape == (48, 64)
        assert float(m.min()) >= 0.0
        assert float(m.max()) <= 1.0


def test_framing_deterministic():
    xs = np.array([0.0, 1.0, 2.0])
    ys = np.array([0.0, 0.5, 1.0])
    a = framing_transform(xs, ys, width=100, height=80, margin=1.2, center_bias=0.6)
    b = framing_transform(xs, ys, width=100, height=80, margin=1.2, center_bias=0.6)
    np.testing.assert_allclose(a[0], b[0])
    np.testing.assert_allclose(a[1], b[1])


def test_parse_composition_defaults():
    c = parse_composition({"margin": 1.4, "mask": "ring"})
    assert c["margin"] == 1.4
    assert c["mask"] == "ring"
    assert "background" in c


def test_pfl_styles_preserve_piece_keys():
    styles = list_styles()
    assert len(styles) >= 6
    base = {"attractor_type": "clifford", "steps": 1000, "palette": "ink"}
    out = apply_style_to_params("pfl-ritual", base)
    assert out["attractor_type"] == "clifford"
    assert out["steps"] == 1000
    assert out["pfl_style"] == "pfl-ritual"
    # Explicit style overwrites palette/paper for art direction
    assert out["palette"] == PFL_STYLES["pfl-ritual"]["palette"]
    assert out["paper_style"] == "warm-paper"
    empty = apply_style_to_params("pfl-signal", {"steps": 10})
    assert empty["palette"] == PFL_STYLES["pfl-signal"]["palette"]


def test_geometry_composition_modes():
    ir = {
        "primitives": [
            {"kind": "line", "x1": -1, "y1": 0, "x2": 1, "y2": 0, "stroke": 1.0},
            {"kind": "circle", "cx": 0, "cy": 0, "r": 0.5, "stroke": 1.0},
        ]
    }
    out = apply_geometry_composition(ir, "fragment", seed=7)
    assert "primitives" in out
    assert len(out["primitives"]) >= 1

    construction = apply_geometry_composition(ir, "construction", seed=1)
    assert all(p.get("kind") == "circle" for p in construction["primitives"])
    assert construction["meta"]["construction"] is True

    anim = apply_geometry_composition(ir, "construction", seed=1, for_animation=True)
    assert any(p.get("kind") == "line" for p in anim["primitives"])


def test_construction_progress_phases():
    from numbrane_python.composition.grammar import reveal_construction_progress

    ir = {
        "primitives": [
            {"kind": "circle", "cx": 0, "cy": 0, "r": 1.0},
            {"kind": "circle", "cx": 1, "cy": 0, "r": 1.0},
            {"kind": "circle", "cx": -1, "cy": 0, "r": 1.0},
            {"kind": "line", "x1": 0, "y1": 0, "x2": 1, "y2": 0},
            {"kind": "line", "x1": 0, "y1": 0, "x2": -1, "y2": 0},
        ],
        "meta": {},
    }
    early = reveal_construction_progress(ir, 0.1)
    assert early["meta"]["construction_phase"] == "centers"
    assert all(p.get("kind") == "circle" for p in early["primitives"])
    assert all(float(p["r"]) <= 0.04 for p in early["primitives"])

    mid = reveal_construction_progress(ir, 0.35)
    assert mid["meta"]["construction_phase"] == "circles"
    assert not any(p.get("kind") == "line" for p in mid["primitives"])

    late = reveal_construction_progress(ir, 0.6)
    assert late["meta"]["construction_phase"] == "edges"
    assert any(p.get("kind") == "line" for p in late["primitives"])

    full = reveal_construction_progress(ir, 0.95)
    assert full["meta"]["construction_phase"] == "layers"
    assert len(full["primitives"]) == len(ir["primitives"])
