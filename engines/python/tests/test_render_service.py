"""Tests for Docker render service models and helpers."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SERVICE = ROOT / "docker" / "render_service.py"


def _load():
    spec = importlib.util.spec_from_file_location("render_service", SERVICE)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.mark.skipif(not SERVICE.exists(), reason="render_service missing")
def test_render_body_validates_piece():
    mod = _load()
    body = mod.RenderBody(piece="geometry/metatron", seed=42, width=640, height=360)
    assert body.piece == "geometry/metatron"
    with pytest.raises(Exception):
        mod.RenderBody(piece="../etc/passwd")


@pytest.mark.skipif(not SERVICE.exists(), reason="render_service missing")
def test_export_frame_count():
    mod = _load()
    body = mod.ExportAnimBody(
        piece="fields/flow-hatching",
        fps=12,
        duration_sec=2.0,
        format="webp",
    )
    assert mod._frame_count(body) == 24
    body2 = mod.ExportAnimBody(
        piece="fields/flow-hatching",
        start_frame=10,
        end_frame=20,
        format="webm",
    )
    assert mod._frame_count(body2) == 10
