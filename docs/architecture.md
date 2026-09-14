# Architecture

NUMBRANE is a **polyglot** system for generative audiovisual art. No implementation language is the architectural center.

## Layers

```text
┌─────────────────────────────────────────┐
│  pieces/     artworks & reference probes │
├─────────────────────────────────────────┤
│  engines/    python · web(+glsl) · rust  │
├─────────────────────────────────────────┤
│  spec/       NUMBRANE Art Protocol (NAP) │
└─────────────────────────────────────────┘
```

### NAP (NUMBRANE Art Protocol)

Language-neutral mathematical contract:

- manifests, recipes, parameters, events, telemetry, artifacts
- deterministic RNG
- time, color, coordinate spaces
- tiny geometry IR for semantic contract tests

Represented as JSON Schema Draft 2020-12 + Markdown. YAML is authoring sugar; **JSON-compatible structures are canonical** at protocol boundaries.

### Engines

| Engine | Role |
|--------|------|
| `engines/python` | Reference CPU math, offline render, contract tests; LATTICEFALL world builder |
| `engines/web` | Browser runtime, interaction, WebGL/GLSL, Web Audio; LATTICEFALL conductor |
| `engines/rust` | Deterministic core (RNG, seed streams, particle simulation), CLI, WASM (`LatticefallSim`) |

A piece **may** live in one engine only. Shared algorithms **may** have equivalents in several engines. Cross-engine data must cross NAP.

### Pieces

Executable art + manifests. Flagship: `pieces/flagship/latticefall` (polyglot Euclidean→nonlinear composition).

## Project decisions

1. **RNG:** `xoshiro128**` with u32 seeds and splitmix32 expansion (JS-safe integers).
2. **Circle-lattice probe:** semantic geometry IR parity (Python ↔ TypeScript), not pixel parity.
3. **License:** AGPL-3.0-only.
4. **No AI/ML runtime:** classical algorithms only; LLM use is external to development tooling, never the art pipeline.
5. **Rust lint invocation:** Makefile/CI call `cargo-clippy` with `CARGO_BUILD_JOBS=8` because some developer Cargo configs define a recursive `clippy` alias and `build.jobs = 0`.
6. **LATTICEFALL:** Rust/WASM owns live particles; Python owns offline world IR; GLSL owns GPU composition; TypeScript conducts; digests (not pixels) prove replay.

## What is deliberately not centralized

Python package layout, TypeScript’s Zustand store, or Rust’s crate graph are **not** the system model. Engines adapt to NAP, not the reverse.
