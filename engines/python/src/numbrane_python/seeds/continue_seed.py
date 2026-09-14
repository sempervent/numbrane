"""Continue Seed Artifacts by advancing structured state."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

from numbrane_python.seeds.artifact import (
    ARTIFACT_VERSION,
    PROTOCOL_VERSION,
    SeedArtifact,
    StateFile,
    content_digest,
    load_artifact,
    save_artifact,
)
from numbrane_python.seeds.sim_state import advance_from_artifact_state


def continue_seed_artifact(
    artifact_path: Path,
    *,
    steps: int,
    output: Path | None = None,
) -> SeedArtifact:
    art = load_artifact(Path(artifact_path))
    assert art.root is not None
    arrays: dict[str, np.ndarray] = {}
    meta: dict = {}
    for sf in art.state_files:
        p = art.root / sf.path
        if sf.format == "npy":
            arrays[sf.role] = np.load(p)
        elif sf.role == "meta" and sf.format == "json":
            meta = json.loads(p.read_text(encoding="utf-8"))

    advanced = advance_from_artifact_state(
        art.piece_id,
        arrays,
        meta,
        art.recipe,
        extra_steps=steps,
    )
    out = Path(output) if output else art.root.parent / f"{art.root.name}-continued"
    out.mkdir(parents=True, exist_ok=True)
    (out / "state").mkdir(parents=True, exist_ok=True)
    state_files: list[StateFile] = []
    for name, arr in advanced["arrays"].items():
        rel = f"state/{name}.npy"
        np.save(out / rel, arr)
        state_files.append(
            StateFile(
                role=name,
                path=rel,
                format="npy",
                dtype=str(arr.dtype),
                shape=list(arr.shape),
            )
        )
    meta_path = "state/meta.json"
    (out / meta_path).write_text(json.dumps(advanced["meta"], indent=2) + "\n", encoding="utf-8")
    state_files.append(StateFile(role="meta", path=meta_path, format="json"))
    preview: dict[str, str] = {}
    if advanced.get("preview_png") is not None:
        Image.fromarray(advanced["preview_png"]).save(out / "preview.png")
        preview["png"] = "preview.png"

    new_frame = art.frame + steps
    nxt = SeedArtifact(
        protocol_version=PROTOCOL_VERSION,
        artifact_version=ARTIFACT_VERSION,
        piece_id=art.piece_id,
        engine=art.engine,
        seed=art.seed,
        artifact_type=advanced["artifact_type"],
        content_digest="",
        frame=new_frame,
        tick=new_frame,
        width=art.width,
        height=art.height,
        recipe=art.recipe,
        state_files=state_files,
        preview=preview,
        notes=f"continued +{steps} from {art.content_digest}",
    )
    nxt.content_digest = content_digest(nxt.to_manifest())
    save_artifact(nxt, out)
    return nxt
