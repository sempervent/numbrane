"""Tests for Docker render service models and helpers."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

pytest.importorskip("fastapi")

ROOT = Path(__file__).resolve().parents[3]
SERVICE = ROOT / "docker" / "render_service.py"


def _load():
    spec = importlib.util.spec_from_file_location("render_service", SERVICE)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
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


@pytest.mark.skipif(not SERVICE.exists(), reason="render_service missing")
def test_animation_job_encode_requires_distinct_frames(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    monkeypatch.setenv("ARTIFACTS_DIR", str(tmp_path / "artifacts"))
    mod = _load()
    client = TestClient(mod.app)
    created = client.post("/api/animation-jobs")
    assert created.status_code == 200
    job_id = created.json()["job_id"]
    # Distinct 1×1 PNG payloads (red vs blue)
    red = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDAT\x08\xd7c\xf8\xcf"
        b"\xc0\x00\x00\x03\x01\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    blue = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDAT\x08\xd7c\xf8\x0f"
        b"\xc0\x00\x00\x03\x01\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    assert client.put(f"/api/animation-jobs/{job_id}/frames/0", content=red).status_code == 200
    assert client.put(f"/api/animation-jobs/{job_id}/frames/1", content=blue).status_code == 200
    enc = client.post(
        f"/api/animation-jobs/{job_id}/encode",
        json={
            "fps": 2,
            "format": "gif",
            "quality": 0.8,
            "loop": True,
            "piece": "fractals/sdf-raymarch2d",
            "seed": 42,
            "frame_count": 2,
        },
    )
    assert enc.status_code == 200, enc.text
    assert enc.headers.get("X-Numbrane-Frames") == "2"
    assert len(enc.content) > 64
    client.delete(f"/api/animation-jobs/{job_id}")
