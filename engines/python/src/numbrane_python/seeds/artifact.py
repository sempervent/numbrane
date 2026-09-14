"""Seed Artifact persistence and digests."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from platformdirs import user_data_dir

PROTOCOL_VERSION = "0.1.0"
ARTIFACT_VERSION = "1"


def default_library_root() -> Path:
    return Path(user_data_dir("numbrane", "numbrane")) / "seeds"


def content_digest(payload: dict[str, Any]) -> str:
    """Stable FNV-ish hex digest over canonical JSON (no created_at)."""
    body = {k: v for k, v in payload.items() if k not in {"created_at", "content_digest"}}
    raw = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


@dataclass
class StateFile:
    role: str
    path: str
    format: str = "json"
    dtype: str | None = None
    shape: list[int] | None = None


@dataclass
class SeedArtifact:
    protocol_version: str
    artifact_version: str
    piece_id: str
    engine: str
    seed: int
    artifact_type: str
    content_digest: str
    piece_version: str | None = None
    frame: int = 0
    tick: int = 0
    width: int | None = None
    height: int | None = None
    recipe: dict[str, Any] = field(default_factory=dict)
    state_files: list[StateFile] = field(default_factory=list)
    preview: dict[str, str] = field(default_factory=dict)
    created_at: str | None = None
    notes: str | None = None
    root: Path | None = None

    def to_manifest(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "protocol_version": self.protocol_version,
            "artifact_version": self.artifact_version,
            "piece_id": self.piece_id,
            "engine": self.engine,
            "seed": int(self.seed) & 0xFFFFFFFF,
            "artifact_type": self.artifact_type,
            "frame": int(self.frame),
            "tick": int(self.tick),
            "recipe": self.recipe,
            "state_files": [asdict(s) for s in self.state_files],
            "preview": self.preview,
            "content_digest": self.content_digest,
        }
        if self.piece_version:
            d["piece_version"] = self.piece_version
        if self.width is not None:
            d["width"] = self.width
        if self.height is not None:
            d["height"] = self.height
        if self.created_at:
            d["created_at"] = self.created_at
        if self.notes:
            d["notes"] = self.notes
        return d


def save_artifact(art: SeedArtifact, root: Path) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    if not art.created_at:
        art.created_at = datetime.now(UTC).isoformat()
    manifest = art.to_manifest()
    # recompute digest without created_at
    art.content_digest = content_digest(manifest)
    manifest["content_digest"] = art.content_digest
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    art.root = root
    return root


def load_artifact(root: Path) -> SeedArtifact:
    root = Path(root)
    data = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    states = [
        StateFile(
            role=s["role"],
            path=s["path"],
            format=s.get("format", "json"),
            dtype=s.get("dtype"),
            shape=s.get("shape"),
        )
        for s in data.get("state_files", [])
    ]
    art = SeedArtifact(
        protocol_version=data["protocol_version"],
        artifact_version=data["artifact_version"],
        piece_id=data["piece_id"],
        engine=data["engine"],
        seed=int(data["seed"]),
        artifact_type=data["artifact_type"],
        content_digest=data["content_digest"],
        piece_version=data.get("piece_version"),
        frame=int(data.get("frame", 0)),
        tick=int(data.get("tick", 0)),
        width=data.get("width"),
        height=data.get("height"),
        recipe=data.get("recipe") or {},
        state_files=states,
        preview=data.get("preview") or {},
        created_at=data.get("created_at"),
        notes=data.get("notes"),
        root=root,
    )
    return art


def list_artifacts(library: Path | None = None) -> list[Path]:
    root = library or default_library_root()
    if not root.exists():
        return []
    return sorted(p for p in root.iterdir() if (p / "manifest.json").is_file())
