"""Static render regression for Studio mashup pieces."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from numbrane_python.core.config import Quality
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.rng import RNG

MASHUP_CASES = [
    (
        "numbrane_python.sketches.mashups.cosmic_venation_tiles",
        "CosmicVenationTilesConfig",
        "cosmic_venation_tiles",
    ),
    (
        "numbrane_python.sketches.mashups.attractor_calligraphy",
        "AttractorCalligraphyConfig",
        "attractor_calligraphy",
    ),
    (
        "numbrane_python.sketches.mashups.bureaucratic_growth_forms",
        "BureaucraticGrowthFormsConfig",
        "bureaucratic_growth_forms",
    ),
    ("numbrane_python.sketches.mashups.ritual_diagrams", "RitualDiagramsConfig", "ritual_diagrams"),
    ("numbrane_python.sketches.mashups.slime_on_sdf", "SlimeOnSDFConfig", "slime_on_sdf"),
    (
        "numbrane_python.sketches.mashups.striped_worms_eating_boxes",
        "StripedWormsEatingBoxesConfig",
        "striped_worms_eating_boxes",
    ),
]


@pytest.mark.parametrize("module_path,cfg_name,_sketch", MASHUP_CASES)
@pytest.mark.parametrize("seed", [42, 7, 99])
def test_mashup_static_render(module_path: str, cfg_name: str, _sketch: str, seed: int):
    import importlib

    mod = importlib.import_module(module_path)
    cfg_cls = getattr(mod, cfg_name)
    extra: dict = {}
    if _sketch == "attractor_calligraphy":
        extra = {"steps": 8000, "burn_in": 400}
    elif _sketch == "striped_worms_eating_boxes":
        extra = {"max_steps": 400}
    cfg = cfg_cls(seed=seed, width=640, height=480, **extra)
    ctx = RenderContext(
        rng=RNG(seed),
        width=640,
        height=480,
        quality=Quality(mode="preview"),
        output_dir=Path("."),
    )
    result = mod.render(cfg, ctx)
    assert result.image.shape == (480, 640, 3)
    assert result.image.dtype == np.uint8
    assert float(result.image.max()) > 0, f"{_sketch} produced empty image"


def test_cosmic_venation_tiles_regression_seed_42():
    import importlib

    mod = importlib.import_module("numbrane_python.sketches.mashups.cosmic_venation_tiles")
    cfg = mod.CosmicVenationTilesConfig(seed=42, width=640, height=480)
    ctx = RenderContext(
        rng=RNG(42),
        width=640,
        height=480,
        quality=Quality(mode="preview"),
        output_dir=Path("."),
    )
    result = mod.render(cfg, ctx)
    assert result.image.shape == (480, 640, 3)
    assert float(result.image.mean()) > 1.0
    assert float(result.image.max()) > 50
