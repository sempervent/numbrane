# Deterministic RNG (NAP v0)

## Algorithm

**xoshiro128\*\*** with **splitmix32** seed expansion.

Rationale: compact 32-bit state family; identical integer arithmetic in Python, TypeScript, and Rust; seeds fit in JavaScript `Number` safely (`u32`).

## Seed

- Type: `u32` (0 … 4294967295)
- Expansion: four `splitmix32` outputs initialize state `s0..s3`
- If state would be all zeros, set `s0 = 1`

## API

```text
random_u32() -> u32
random_f64() -> f64 in [0, 1)
```

Float conversion (exact across JS/Python/Rust):

```text
random_f64 = (random_u32() >> 8) * (1.0 / 16777216.0)
```

## Test vectors

[`vectors.json`](vectors.json) — consumed by Python, TypeScript, and Rust tests.

## Implementations

- Python: `engines/python/src/numbrane_python/rng.py`
- TypeScript: `engines/web/src/rng.ts`
- Rust: `engines/rust/crates/numbrane-core/src/rng.rs`
