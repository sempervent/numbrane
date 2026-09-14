# Still rendering & Seed Artifacts

NUMBRANE generates high-quality deterministic stills and reusable **Seed Artifacts** that can continue animation.

## Still render

```bash
# via just
just render geometry/metatron seed=42 width=4096 height=4096 format=svg

# or directly
cd engines/python && uv run python ../../tools/numbrane_cli.py render fractals/strange-attractors \
  --seed 137 --width 3840 --height 2160 --output ../../artifacts/attractor.png

uv run python ../../tools/numbrane_cli.py render reaction-diffusion/reaction-diffusion \
  --seed 42 --frame 1800 --width 512 --height 512 -o ../../artifacts/rd.png
```

Flags: `piece`, `--seed`, `--recipe`, `--frame`, `--width`, `--height`, `--format` (`png`|`svg`|`json`), `--output`.

Geometry pieces emit **SVG** (semantic circles/lines). Simulation pieces map `--frame` to iteration/step count for exact-frame stills without requiring a DAW or LIVE session.

## Seed Artifacts

A Seed Artifact is a directory:

```text
manifest.json     # NAP seed-artifact schema
state/*.npy|json  # structured fields / agents / geometry
preview.png|svg
```

```bash
numbrane seed create growth/slime-mold --seed 42 --frame 200 --width 256 --height 256 -o ./seeds/slime-42
numbrane seed list
numbrane seed inspect ./seeds/slime-42
numbrane seed render ./seeds/slime-42 -o preview.png
numbrane seed continue ./seeds/slime-42 --steps 100 -o ./seeds/slime-42b
```

Default library root: platform user data dir `numbrane/seeds` (override with `--output` / `--library`).

Continuation of **reaction-diffusion** and **slime-mold** advances the same structured state that a single longer run would produce (within float tolerance).

Raster previews can be transformed into nutrient maps, emission densities, or displacement fields for further generative use (`numbrane_python.seeds.raster_maps`).

## Gallery

```bash
just gallery
just gallery-smoke
```

Outputs under `artifacts/gallery` (gitignored).
