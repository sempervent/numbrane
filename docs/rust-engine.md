# Rust engine

Deliberately small: `numbrane-core` (RNG, seed streams, particles), `numbrane-cli`, `numbrane-wasm` (`LatticefallSim`).

Cross-language RNG vectors live in `spec/rng/vectors.json` and are tested here.

```bash
just test-rust
just latticefall-build
```

WASM JS bindings are generated under `engines/web/src/wasm/pkg/` (gitignored; build in CI via `just latticefall-build`).
