# PFL Visualizer 0.2.0

Standalone **Positive Feedback Loop** artwork instrument at `/pfl.html` (no Studio).

## Artwork types

- **Flow Field** — luminous multi-layer streamlines with seed archetypes
- **Fractal Morph** — evolving IFS density with swirl / spherical variation
- **Block Lattice** — packed isometric blocks with breathing displacement

## Run

```bash
cd engines/web && npm ci && npm run dev:pfl
```

Open `http://localhost:5173/pfl.html` — deep link: `?type=fractal-morph&seed=424242`.

## Build

```bash
cd engines/web && npm run build:pfl
```

Serve `dist/pfl.html` from any static host.

## Verification

```bash
just pfl-test
```
