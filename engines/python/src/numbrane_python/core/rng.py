"""RNG adapter: NAP xoshiro128** plus numpy Generator bridge."""

from __future__ import annotations

from numbrane_python.core.rng_numpy import RNG
from numbrane_python.rng import MASK, Rng, expand_seed

__all__ = ["Rng", "RNG", "numpy_rng_from_nap_seed", "expand_seed", "MASK"]


def numpy_rng_from_nap_seed(seed: int) -> RNG:
    """Derive a stable numpy RNG from a u32 NAP seed.

    Uses NAP xoshiro draws so the numpy seed is a deterministic function of the
    protocol seed, without treating the raw u32 as the numpy BitGenerator seed.
    """
    nap = Rng(int(seed) & MASK)
    hi = nap.random_u32()
    lo = nap.random_u32()
    derived = (hi << 32) | lo
    return RNG(derived)
