# Protocol determinism

See also the project-level [`docs/determinism.md`](../../docs/determinism.md).

## Seed

- Type: unsigned 32-bit integer (`0 … 4294967295`)
- Representable exactly in Python `int`, JavaScript `Number`, Rust `u32`, and as a GLSL `uint` when passed carefully
- Expanded via **splitmix32** into xoshiro128** state

## RNG API (v0)

- `random_u32() -> u32`
- `random_f64() -> f64` in `[0, 1)` via `(u32 >> 8) * (1/2^24)`

Shared vectors: [`../rng/vectors.json`](../rng/vectors.json).

## Pixel disclaimer

Equivalent CPU/GPU floating-point algorithms do **not** automatically produce bit-identical pixels. Determinism claims must cite which layer they satisfy.
