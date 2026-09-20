"""Pack export helpers — contact sheet indexing and deterministic stems."""

from __future__ import annotations

import importlib.util
from pathlib import Path

_LIB = Path(__file__).resolve().parents[3] / "tools" / "pack_export_lib.py"
_spec = importlib.util.spec_from_file_location("pack_export_lib", _LIB)
assert _spec and _spec.loader
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
slugify = _mod.slugify
item_stem = _mod.item_stem
contact_label = _mod.contact_label


def test_slugify_midnight() -> None:
    assert slugify("Midnight PFL Pack") == "midnight-pfl-pack"


def test_item_stem_stable() -> None:
    assert item_stem(1, "geometry/metatron", 42) == "01-geometry_metatron-s42"


def test_contact_label_uses_order_not_array_index_after_skip() -> None:
    """Labels follow pack order so a failed item cannot shift N→N+1 metadata."""
    assert contact_label(3, "growth/slime-mold", 9) == "03  slime-mold  s9"
