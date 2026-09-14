# Rust engine

Deliberately small deterministic core:

| Crate | Role |
|-------|------|
| `numbrane-core` | xoshiro128** RNG, named seed streams, LATTICEFALL particles |
| `numbrane-cli` | Minimal `numbrane` binary |
| `numbrane-wasm` | WASM bridge (`LatticefallSim` via wasm-bindgen) |

Cross-language RNG vectors live in `spec/rng/vectors.json` and are tested here.

```bash
just test-rust
just latticefall-build   # → engines/web/src/wasm/pkg (gitignored; generate in CI)
```

`engines/rust/scripts/build-wasm.sh` prefers `wasm-pack build … --target web`; falls back to `cargo build --target wasm32-unknown-unknown` + `wasm-bindgen-cli`.
