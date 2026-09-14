"""Mashup sketch schemas — intentional cross-system combinations."""

from __future__ import annotations

import importlib
from pathlib import Path
from typing import Any

_MASHUPS_DIR = Path(__file__).resolve().parent

__all__ = [
    "attractor_calligraphy",
    "bureaucratic_growth_forms",
    "cosmic_venation_tiles",
    "ritual_diagrams",
    "slime_on_sdf",
    "striped_worms_eating_boxes",
]


def __getattr__(name: str) -> Any:
    module_path = _MASHUPS_DIR / f"{name}.py"
    if module_path.is_file():
        return importlib.import_module(f"numbrane_python.sketches.mashups.{name}")
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def __dir__() -> list[str]:
    names = set(__all__)
    for path in _MASHUPS_DIR.glob("*.py"):
        if path.name != "__init__.py":
            names.add(path.stem)
    return sorted(names)
