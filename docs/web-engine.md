# Web engine

Home: `engines/web/`.

Deterministic browser runtime:

- Logical time `t = frame / fps` into GLSL `u_time`
- `Rng` replaces uncontrolled randomness
- Event record/replay (`events.ts`, `NodesWorld.runReplay`)
- Telemetry → Tone.js mapping (`audio.ts`, `latticefall/audioBridge.ts`)
- Shaders: `shaders/plasma.frag`, `escape.frag`, `rd_view.frag`, **`latticefall.frag`**

## LATTICEFALL

Entry: `latticefall.html` → `src/latticefall/`.

Orchestrates Python-built world JSON (`public/latticefall/world.default.json`),
Rust/WASM `LatticefallSim`, phase envelopes, semantic digests, and Tone scheduling.

```bash
just latticefall-build
just latticefall
just latticefall-smoke   # Playwright + SwiftShader WebGL
```

Browser CI uses Chromium with `--use-angle=swiftshader` (software GL). Tests prove
shader compile/link, WASM load, and **semantic digest** replay equality — not
cross-GPU pixel identity.
