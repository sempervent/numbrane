"""Tests for RD settle, DG growth stages, and Truchet macro composition."""

from __future__ import annotations

import numpy as np

from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.rng import RNG
from numbrane_python.sketches import differential_growth, reaction_diffusion, truchet_tiles


def _ctx(w: int = 64, h: int = 64, seed: int = 42) -> RenderContext:
    return RenderContext(rng=RNG(seed), width=w, height=h)


def test_rd_settle_differs_from_raw_ic():
    """Settled field is more developed than the initial condition."""
    cfg = reaction_diffusion.ReactionDiffusionConfig(
        seed=7,
        width=64,
        height=64,
        evolved_preset="lace",
        settle_steps=1600,
        settle_cap=2200,
        auto_extend_settle=True,
        iterations=1600,
    )
    _u, v_settled, v_ic = reaction_diffusion.simulate_settled(cfg, width=64, height=64)
    m_ic = reaction_diffusion.field_development_metrics(v_ic)
    m_s = reaction_diffusion.field_development_metrics(v_settled)
    # Evolved pattern should not equal the raw IC seed field
    assert not np.allclose(v_settled, v_ic, atol=1e-5)
    assert m_s["occupied"] > 0.04
    assert m_s["variance"] > 0.004
    # Settled lace develops structure beyond sparse IC seeds
    assert m_s["edge_density"] > m_ic["edge_density"] * 0.4 or m_s["occupied"] > m_ic["occupied"]


def test_rd_evolved_preset_sets_ic_and_fk():
    cfg = reaction_diffusion.ReactionDiffusionConfig(evolved_preset="worms")
    applied = reaction_diffusion.apply_evolved_preset(cfg)
    assert applied.initial_condition == "stripe"
    assert abs(applied.f - 0.037) < 1e-9
    assert abs(applied.k - 0.06) < 1e-9
    assert applied.settle_steps > 0


def test_dg_stages_progress():
    """Overgrown maps to more steps / denser output than young."""
    young_cfg = differential_growth.apply_growth_stage(
        differential_growth.DifferentialGrowthConfig(
            seed=11,
            width=80,
            height=80,
            growth_stage="young",
            initial_topology="islands",
            num_seeds=3,
            historical_trails=False,
        )
    )
    over_cfg = differential_growth.apply_growth_stage(
        differential_growth.DifferentialGrowthConfig(
            seed=11,
            width=80,
            height=80,
            growth_stage="overgrown",
            initial_topology="islands",
            num_seeds=3,
            historical_trails=False,
        )
    )
    assert differential_growth.resolve_steps(over_cfg) > differential_growth.resolve_steps(
        young_cfg
    )
    assert over_cfg.branch_prob > young_cfg.branch_prob

    # Bounded runs: same seed, stage-scaled step budgets (not full preset lengths).
    y_run = young_cfg.model_copy(update={"steps": 40, "historical_trails": False})
    o_run = over_cfg.model_copy(update={"steps": 120, "historical_trails": False})
    ctx = _ctx(80, 80, seed=11)
    y_segs, _ = differential_growth.grow_segments(y_run, ctx, ctx.rng.generator)
    ctx2 = _ctx(80, 80, seed=11)
    o_segs, _ = differential_growth.grow_segments(o_run, ctx2, ctx2.rng.generator)
    assert len(o_segs) > len(y_segs)

    ry = differential_growth.render(y_run, _ctx(64, 64, 11))
    ro = differential_growth.render(o_run, _ctx(64, 64, 11))
    y_ink = int(np.sum(np.any(ry.image > 8, axis=2)))
    o_ink = int(np.sum(np.any(ro.image > 8, axis=2)))
    assert o_ink > y_ink


def test_truchet_macro_composition_changes_structure():
    """Different macro_composition → different orientation digest / occupancy."""
    base = dict(seed=21, tile_size=24, tile_scale=1.0, pattern_continuity=0.9, perturbation=0.0)
    a_orient, a_active, _, _ = truchet_tiles.build_orientation_grid(
        truchet_tiles.TruchetTilesConfig(**base, macro_composition="uniform"),
        width=128,
        height=128,
    )
    b_orient, b_active, _, _ = truchet_tiles.build_orientation_grid(
        truchet_tiles.TruchetTilesConfig(**base, macro_composition="masked-void"),
        width=128,
        height=128,
    )
    c_orient, c_active, _, _ = truchet_tiles.build_orientation_grid(
        truchet_tiles.TruchetTilesConfig(**base, macro_composition="bands"),
        width=128,
        height=128,
    )
    da = truchet_tiles.grid_digest(a_orient, a_active)
    db = truchet_tiles.grid_digest(b_orient, b_active)
    dc = truchet_tiles.grid_digest(c_orient, c_active)
    assert da != db
    assert da != dc
    assert truchet_tiles.occupied_region_count(b_active) < truchet_tiles.occupied_region_count(
        a_active
    )


def test_truchet_smoke_render():
    cfg = truchet_tiles.TruchetTilesConfig(
        seed=3,
        width=80,
        height=80,
        tile_size=20,
        macro_composition="radial",
        pattern_continuity=0.85,
        perturbation=0.0,
    )
    result = truchet_tiles.render(cfg, _ctx(80, 80, 3))
    assert result.image.shape == (80, 80, 3)
    assert int(np.sum(result.image > 0)) > 0
