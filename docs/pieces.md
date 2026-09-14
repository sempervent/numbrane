# Pieces

Discoverable NAP manifests under `pieces/`.

```bash
just pieces
just render geometry/seed-of-life seed=1
just render landscape/noise-landscape seed=42
just render fractals/strange-attractors seed=42
just render reference/circle-lattice seed=42
just render flagship/latticefall seed=42
just latticefall          # flagship live WebGL + WASM + Tone
just latticefall-smoke    # Playwright WebGL/WASM/replay digests
just dev-web              # audiovisual/nodes, escape-time shaders
just dev-web latticefall  # same as just latticefall
```

## Flagship

| Piece | Notes |
|-------|-------|
| `flagship/latticefall` | Polyglot Euclidean→nonlinear composition (Python world, Rust particles, GLSL, Tone) |

## Families

| Family | Origin |
|--------|--------|
| `flagship/` | NUMBRANE original compositions |
| `geometry/` | generative + circle packing |
| `fields/` | Nebula / flow hatching |
| `growth/` | L-system, differential growth, slime mold |
| `fractals/` | Attractors, SDF, escape-time |
| `reaction-diffusion/` | Gray-Scott |
| `particles/` | Particle systems |
| `tiling/` | Truchet / Voronoi |
| `landscape/` | Noise landscape |
| `audiovisual/` | Nodes + Tone.js |
| `mashups/` | Compositional mashups |
| `reference/` | protocol probes |
