"""Create Seed Artifacts from piece recipes."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from numbrane_python.seeds.artifact import (
    ARTIFACT_VERSION,
    PROTOCOL_VERSION,
    SeedArtifact,
    StateFile,
    content_digest,
    save_artifact,
)
from numbrane_python.seeds.svg_export import geometry_ir_to_svg


def _write_npy(root: Path, name: str, arr: np.ndarray) -> StateFile:
    path = f"state/{name}.npy"
    (root / "state").mkdir(parents=True, exist_ok=True)
    np.save(root / path, arr)
    return StateFile(
        role=name,
        path=path,
        format="npy",
        dtype=str(arr.dtype),
        shape=list(arr.shape),
    )


def _write_json(root: Path, name: str, data: Any) -> StateFile:
    path = f"state/{name}.json"
    (root / "state").mkdir(parents=True, exist_ok=True)
    (root / path).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return StateFile(role=name, path=path, format="json")


def create_seed_artifact(
    piece_id: str,
    recipe: dict[str, Any],
    *,
    output: Path,
    frame: int = 0,
    width: int | None = None,
    height: int | None = None,
    engine: str = "python",
) -> SeedArtifact:
    """Generate structured Seed Artifact + preview for a piece."""
    from numbrane_python.seeds.sim_state import build_piece_state

    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    seed = int(recipe.get("seed", 42)) & 0xFFFFFFFF
    params = dict(recipe.get("parameters") or {})
    w = int(width or params.get("width") or params.get("output.width") or 512)
    h = int(height or params.get("height") or params.get("output.height") or 512)
    params["width"] = w
    params["height"] = h
    params["output.width"] = w
    params["output.height"] = h
    recipe = {**recipe, "seed": seed, "parameters": params}

    built = build_piece_state(piece_id, recipe, frame=frame, width=w, height=h)
    state_files: list[StateFile] = []
    for name, value in built["arrays"].items():
        state_files.append(_write_npy(output, name, np.asarray(value)))
    for name, value in built["json_blobs"].items():
        state_files.append(_write_json(output, name, value))

    preview: dict[str, str] = {}
    if built.get("preview_png") is not None:
        preview_path = "preview.png"
        Image.fromarray(built["preview_png"]).save(output / preview_path)
        preview["png"] = preview_path
    if built.get("geometry_ir") is not None:
        ir = built["geometry_ir"]
        state_files.append(_write_json(output, "geometry", ir))
        svg = geometry_ir_to_svg(ir, width=min(w, 2048), height=min(h, 2048))
        (output / "preview.svg").write_text(svg, encoding="utf-8")
        preview["svg"] = "preview.svg"

    art = SeedArtifact(
        protocol_version=PROTOCOL_VERSION,
        artifact_version=ARTIFACT_VERSION,
        piece_id=piece_id,
        engine=engine if piece_id != "flagship/latticefall" else "polyglot",
        seed=seed,
        artifact_type=built["artifact_type"],
        content_digest="",
        frame=frame,
        tick=frame,
        width=w,
        height=h,
        recipe=recipe,
        state_files=state_files,
        preview=preview,
    )
    art.content_digest = content_digest(art.to_manifest())
    save_artifact(art, output)
    return art
