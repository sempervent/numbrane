"""Seed Artifact and still-render tests."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from numbrane_python.geometry.lattice import geometry_ir_from_centers, seed_of_life_centers
from numbrane_python.seeds import (
    continue_seed_artifact,
    create_seed_artifact,
    load_artifact,
    raster_to_displacement,
    raster_to_nutrient_map,
)
from numbrane_python.seeds.sim_state import simulate_reaction_diffusion, simulate_slime
from numbrane_python.seeds.svg_export import geometry_ir_to_svg


def test_geometry_svg_export():
    ir = geometry_ir_from_centers(seed_of_life_centers(1.0), 1.0)
    svg = geometry_ir_to_svg(ir, width=512, height=512)
    assert "<svg" in svg and "<circle" in svg


def test_rd_exact_frame_deterministic(tmp_path: Path):
    u1, v1 = simulate_reaction_diffusion(64, 64, 42, iterations=50)
    u2, v2 = simulate_reaction_diffusion(64, 64, 42, iterations=50)
    assert np.allclose(u1, u2)
    assert np.allclose(v1, v2)


def test_rd_continuation_matches_direct(tmp_path: Path):
    u_a, v_a = simulate_reaction_diffusion(48, 48, 7, iterations=40)
    u_b, v_b = simulate_reaction_diffusion(48, 48, 7, iterations=20)
    u_c, v_c = simulate_reaction_diffusion(48, 48, 7, iterations=20, u0=u_b, v0=v_b)
    assert np.allclose(u_a, u_c, atol=1e-5)
    assert np.allclose(v_a, v_c, atol=1e-5)


def test_slime_continuation_matches_direct():
    a1, t1 = simulate_slime(64, 64, 3, steps=30, num_agents=40)
    a0, t0 = simulate_slime(64, 64, 3, steps=15, num_agents=40)
    a2, t2 = simulate_slime(64, 64, 3, steps=15, num_agents=40, agents0=a0, trail0=t0)
    assert np.allclose(a1, a2, atol=1e-4)
    assert np.allclose(t1, t2, atol=1e-4)


def test_seed_artifact_create_inspect_continue(tmp_path: Path):
    recipe = {
        "protocol_version": "0.1.0",
        "piece_id": "reaction-diffusion/reaction-diffusion",
        "seed": 42,
        "parameters": {"width": 48, "height": 48, "iterations": 30},
    }
    root = tmp_path / "rd-seed"
    art = create_seed_artifact(
        "reaction-diffusion/reaction-diffusion",
        recipe,
        output=root,
        frame=30,
        width=48,
        height=48,
    )
    assert (root / "manifest.json").exists()
    assert (root / "preview.png").exists()
    loaded = load_artifact(root)
    assert loaded.content_digest == art.content_digest
    assert loaded.artifact_type == "simulation-state"

    cont = continue_seed_artifact(root, steps=10, output=tmp_path / "rd-cont")
    assert cont.frame == 40
    assert (tmp_path / "rd-cont" / "preview.png").exists()


def test_seed_geometry_artifact(tmp_path: Path):
    recipe = {"seed": 1, "parameters": {"geom.radius": 1.0, "width": 256, "height": 256}}
    art = create_seed_artifact(
        "geometry/seed-of-life",
        recipe,
        output=tmp_path / "geom",
        width=256,
        height=256,
    )
    assert art.artifact_type == "geometry"
    assert (tmp_path / "geom" / "preview.svg").exists()


def test_raster_transforms(tmp_path: Path):
    from PIL import Image

    arr = np.zeros((32, 32), dtype=np.uint8)
    arr[8:24, 8:24] = 255
    path = tmp_path / "blob.png"
    Image.fromarray(arr).save(path)
    nutrient = raster_to_nutrient_map(str(path))
    assert nutrient.max() > 0.9
    dx, dy = raster_to_displacement(str(path))
    assert dx.shape == nutrient.shape
    assert np.isfinite(dx).all()


def test_differential_growth_continuation():
    from numbrane_python.seeds.sim_state import simulate_differential_growth

    a = simulate_differential_growth(128, 128, 9, steps=40, num_seeds=3)
    b = simulate_differential_growth(128, 128, 9, steps=20, num_seeds=3)
    c = simulate_differential_growth(128, 128, 9, steps=20, segments0=b, start_step=20)
    assert a.shape == c.shape
    assert np.allclose(a, c, atol=1e-4)


def test_lsystem_continuation():
    from numbrane_python.seeds.sim_state import simulate_lsystem

    s1, g1 = simulate_lsystem(1, generations=4)
    s0, _ = simulate_lsystem(1, generations=2)
    s2, _ = simulate_lsystem(1, generations=2, current=s0)
    assert s1 == s2
    assert g1 == 4


def test_noodles_continuation():
    from numbrane_python.seeds.sim_state import simulate_noodles

    a = simulate_noodles(64, 64, 5, steps=30, num_particles=20)
    b = simulate_noodles(64, 64, 5, steps=15, num_particles=20)
    c = simulate_noodles(64, 64, 5, steps=15, positions0=b, start_step=15)
    assert np.allclose(a, c, atol=1e-4)
