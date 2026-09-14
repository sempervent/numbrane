# Determinism

NUMBRANE defines determinism in **layers**. Do not claim bit-identical pixels across GPU vendors or language float pipelines unless a piece explicitly supports that layer.

## Layers

1. **Exact recipe equality** — same JSON/YAML-canonical recipe bytes (or normalized object).
2. **Exact integer RNG stream equality** — same `random_u32` sequence from the same seed (cross-language).
3. **Exact protocol / event / geometry equality** — where mathematically feasible (e.g. geometry IR within documented tolerance, or exact for integer geometry).
4. **Backend-stable rendered output** — same engine + same platform produces stable hashes where tested.
5. **Cross-renderer visual equivalence** — only when a piece/engine explicitly advertises and tests it.

## Rules

- Deterministic execution **must not** depend on wall-clock time.
- Deterministic execution **must not** use uncontrolled RNGs (`Math.random`, unseeded `random`, OS entropy).
- Logical time uses `frame`, `fps`, `t = frame / fps`, `dt = 1 / fps`.
- Live / performance mode may use wall clock, but wall clock must not leak into deterministic recipe replay.
- Floating-point geometry contract tests use an explicit absolute tolerance (default `1e-9` for the circle-lattice probe).

See also: [`protocol.md`](protocol.md) (NAP summary) and the canonical files under `spec/protocol/` and `spec/rng/` in the repository.
