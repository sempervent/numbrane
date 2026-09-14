"""Built-in generative art sketches.

Supports ``from numbrane_python.sketches import noodles`` via lazy discovery of
sibling modules (and ``mashups`` as a subpackage).
"""

from __future__ import annotations

import importlib
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from types import ModuleType

_SKETCHES_DIR = Path(__file__).resolve().parent

__all__ = [
    "circle_packing",
    "differential_growth",
    "flow_hatching",
    "lsystem",
    "nebula",
    "noodles",
    "reaction_diffusion",
    "sdf_raymarch2d",
    "slime_mold",
    "strange_attractors",
    "truchet_tiles",
    "voronoi_stained_glass",
    "mashups",
]


def __getattr__(name: str) -> Any:
    if name == "mashups":
        return importlib.import_module("numbrane_python.sketches.mashups")
    module_path = _SKETCHES_DIR / f"{name}.py"
    if module_path.is_file():
        return importlib.import_module(f"numbrane_python.sketches.{name}")
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def __dir__() -> list[str]:
    names = set(__all__)
    for path in _SKETCHES_DIR.glob("*.py"):
        if path.name != "__init__.py":
            names.add(path.stem)
    return sorted(names)
