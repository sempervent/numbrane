# NUMBRANE

**Numerical Unified Multilingual Bridge for Reproducible Algorithmic Nonlinear Expression**

NUMBRANE is a polyglot system for generative audiovisual art created entirely from **mathematics, algorithms, simulation, procedural rules, and human interaction**.

It is **not** generative AI. No LLM, diffusion, inference APIs, model weights, or prompt-to-image subsystems appear in the runtime.

## Quick start

```bash
just doctor          # check tools
just bootstrap       # install engine deps
just precommit-install   # install pre-commit + pre-push hooks
just ci-lite         # local lightweight CI
just pieces          # list piece catalog
just render geometry/seed-of-life seed=42 width=1024 height=1024 format=svg
just gallery-smoke
just seed-test && just render-test
```

Seed Artifacts persist structured generative state for stills and continuation — see `docs/seeds.md`.

## NUMBRANE Studio

Unified **Generate / Animate / React** frontend (canvas-first, keyboard-driven):

```bash
just studio            # http://127.0.0.1:5173/studio.html
just studio-test
just docker-studio     # Bake image → http://127.0.0.1:8080/studio.html
```

Keys: `1` Generate · `2` Animate · `3` React · `Tab` chrome · `?` help · `F` fullscreen.

See `docs/experimenting.md` for a full playbook.

## Flagship: LATTICEFALL

`pieces/flagship/latticefall` is a coherent polyglot artwork:
Python geometry/fields → Rust/WASM particles → TypeScript conduction → GLSL → Tone.js,
with NAP recipe seeds, event record/replay, and semantic state digests.

```bash
just latticefall-build && just latticefall
just latticefall-test && just latticefall-smoke
```

## NUMBRANE LIVE

Realtime visual performance instrument (microphone / audio input → generative scenes; optional OBS output):

```bash
just live              # control UI + PFL set
just live-pfl          # same, opens pfl-default
just live-test && just live-smoke && just live-e2e
```

See `docs/live.md`, `docs/audio-reactivity.md`, `docs/obs.md`. MIDI is optional (`docs/midi.md`).

## Architecture

```text
pieces/   → artworks (flagship, geometry, fields, growth, fractals, tiling, landscape, audiovisual, mashups)
engines/  → python · web (+ GLSL) · rust
spec/     → NUMBRANE Art Protocol (NAP)
```

## Deterministic replay

Recipes carry `seed` (u32), parameters, and optional event streams. Deterministic mode uses logical `frame`/`fps` (`t = frame/fps`), never wall clock. Interactive web sessions can record/replay NAP events.

## Pre-commit vs CI

- **pre-commit** (commit hook): lints **staged/tracked** files only — fast local gate.
- **pre-push** / `just ci-lite`: maintained repository checks (fmt, lint, tests).
- **`just repo-audit`**: hygiene extras (including F821 sweep).
- **`just ci`**: full gate including docs, golden, WASM build, Playwright browser smoke.

Do not expect pre-commit to lint unrelated untracked files; use `just ci-lite` / `just ci` for whole-tree confidence.

## License

AGPL-3.0-only. See `LICENSE`.
