"""NAP v0 deterministic RNG: xoshiro128** with splitmix32 seed expansion."""

from __future__ import annotations

MASK = 0xFFFFFFFF


def _rotl(x: int, k: int) -> int:
    x &= MASK
    return ((x << k) | (x >> (32 - k))) & MASK


def _splitmix32(state: list[int]) -> int:
    state[0] = (state[0] + 0x9E3779B9) & MASK
    z = state[0]
    z = ((z ^ (z >> 16)) * 0x85EBCA6B) & MASK
    z = ((z ^ (z >> 13)) * 0xC2B2AE35) & MASK
    return (z ^ (z >> 16)) & MASK


def expand_seed(seed: int) -> tuple[int, int, int, int]:
    """Expand a u32 seed into xoshiro128** state."""
    seed &= MASK
    sm = [seed]
    s0 = _splitmix32(sm)
    s1 = _splitmix32(sm)
    s2 = _splitmix32(sm)
    s3 = _splitmix32(sm)
    if s0 == 0 and s1 == 0 and s2 == 0 and s3 == 0:
        s0 = 1
    return s0, s1, s2, s3


class Rng:
    """Cross-language deterministic generator (NAP v0)."""

    def __init__(self, seed: int) -> None:
        self._s = list(expand_seed(seed))

    @property
    def state(self) -> tuple[int, int, int, int]:
        return (self._s[0], self._s[1], self._s[2], self._s[3])

    def random_u32(self) -> int:
        s = self._s
        result = (_rotl((s[1] * 5) & MASK, 7) * 9) & MASK
        t = (s[1] << 9) & MASK
        s[2] ^= s[0]
        s[3] ^= s[1]
        s[1] ^= s[2]
        s[0] ^= s[3]
        s[2] ^= t
        s[3] = _rotl(s[3], 11)
        return result

    def random_f64(self) -> float:
        """Unit interval [0, 1) using top 24 bits."""
        return float(self.random_u32() >> 8) * (1.0 / 16777216.0)
