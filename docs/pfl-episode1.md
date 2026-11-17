# PFL Episode 1 — Multi-Artwork Visualizer

Standalone entry point for Positive Feedback Loop recording. **Does not use Studio.**

Artwork types: **Flow Field** (streamlines), **Fractal Morph** (IFS density), **Block Lattice** (isometric blocks). Deep-link with `?type=fractal-morph&seed=424242`.

## Run

```bash
cd engines/web
npm install
npm run dev:pfl
```

Open **http://localhost:5173/pfl.html**

Production build includes the same URL path under `dist/pfl.html` after `npm run build`.

## OBS workflow

1. Start `npm run dev:pfl` (or serve `dist/` after build).
2. Open `/pfl.html` in Chrome or Firefox.
3. **Source → Demo** until you confirm motion; switch to **File** and choose Episode 1 audio (MP3/WAV).
4. Click **Play**; confirm the activity meter responds.
5. **Hide (H)** or wait for auto-hide; **Fullscreen** for capture.
6. In OBS: **Window Capture** or **Display Capture** of the browser — not Browser Source (mic/file permissions do not carry over).

## Controls

| Control | Action |
|---------|--------|
| Demo | Synthetic musical features (no permission) |
| File | Local audio via Web Audio `MediaElementSource` |
| Input | Microphone / loopback device (never monitored to speakers) |
| Artwork | Select algorithm (audio path unchanged) |
| New variation | New seed within the selected type |
| Gain | Analyzer sensitivity |
| H | Toggle control dock |

## Tests

```bash
npm run test -- --run tests/pfl_features.test.ts tests/pfl_composition.test.ts
PW_CHROMIUM_ARGS="" npx playwright test -c playwright.pfl.config.ts
```

Visual QA: `engines/web/tmp/pfl-review/` — `variation-seed-*.png`, `type-*-default.png`, `contact-*-seed-*.png`

Reference notes (Reddit inspo, uncertainty): `docs/pfl-reference-notes.md`

Regression targets (canvas artwork only): normalized **p99 luma > 0.18**, ≥5 distinct variation digests.

## Legacy Studio

Scene/Set/compositor/orchestration remain in the repo but are **out of scope** for this MVP. See branch `rescue/pfl-minimal-visualizer`.
