"""Named deterministic RNG substreams from a NAP u32 seed.

Algorithm (must match Rust ``numbrane_core::seed_streams``):

1. Hash the UTF-8 stream name with **FNV-1a 32-bit**
   (offset basis ``0x811C9DC5``, prime ``0x01000193``).
2. Mix with the recipe seed: ``state = (seed ^ h) & 0xFFFFFFFF``.
3. Advance **one** splitmix32 step (same constants as ``rng._splitmix32``)
   and use that output as the stream seed.

Derivation is order-independent: each name maps to a fixed u32 regardless of
which other streams are requested.
"""

from __future__ import annotations

from numbrane_python.rng import MASK, _splitmix32

STREAM_NAMES: tuple[str, ...] = (
    "geometry",
    "field",
    "particles",
    "fractal",
    "palette",
    "audio",
    "interaction",
)

FNV_OFFSET = 0x811C9DC5
FNV_PRIME = 0x01000193


def fnv1a32(data: bytes) -> int:
    """FNV-1a 32-bit hash over raw bytes."""
    h = FNV_OFFSET
    for b in data:
        h ^= b
        h = (h * FNV_PRIME) & MASK
    return h


def stream_seed(seed: int, name: str) -> int:
    """Derive one named substream seed from a NAP u32 recipe seed."""
    h = fnv1a32(name.encode("utf-8"))
    state = [(int(seed) ^ h) & MASK]
    return _splitmix32(state)


def derive_streams(seed: int, names: tuple[str, ...] = STREAM_NAMES) -> dict[str, int]:
    """Return ``{stream_name: u32}`` for each named substream."""
    seed &= MASK
    return {name: stream_seed(seed, name) for name in names}
