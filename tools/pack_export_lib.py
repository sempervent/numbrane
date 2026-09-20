"""Shared PFL pack export helpers (render service + tests)."""

from __future__ import annotations

import re


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", str(name).lower()).strip("-")
    return (s or "pfl-pack")[:48]


def still_size(preset: str, preview: bool) -> tuple[int, int]:
    table = {
        "episode-16x9": (3840, 2160),
        "projection-16x9": (1920, 1080),
        "square": (2160, 2160),
        "portrait": (2160, 3840),
    }
    w, h = table.get(preset, (1920, 1080))
    if preview:
        return max(320, w // 6), max(180, h // 6)
    return w, h


def anim_duration(preset: str, fallback: float, preview: bool) -> float:
    table = {"loop-6s": 6.0, "loop-12s": 12.0, "section-20s": 20.0, "section-30s": 30.0}
    d = float(table.get(preset, fallback or 12.0))
    return min(d, 2.0) if preview else d


def item_stem(order: int, piece: str, seed: int) -> str:
    return f"{order:02d}-{piece.replace('/', '_')}-s{seed}"


def contact_label(order: int, piece_id: str, seed: int) -> str:
    tail = piece_id.split("/")[-1] if piece_id else "?"
    return f"{order:02d}  {tail}  s{seed}"
