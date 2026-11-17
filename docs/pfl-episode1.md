# PFL Episode 1 — Flow Field Visualizer

Standalone entry point for Positive Feedback Loop recording. **Does not use Studio.**

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
| New variation | New deterministic seed |
| Gain | Analyzer sensitivity |
| H | Toggle control dock |

## Tests

```bash
npm run test -- --run tests/pfl_features.test.ts
PW_CHROMIUM_ARGS="" npx playwright test tests/e2e/pfl-visualizer.spec.ts
```

Screenshots on failure/success: `engines/web/tmp/pfl-review/`

## Legacy Studio

Scene/Set/compositor/orchestration remain in the repo but are **out of scope** for this MVP. See branch `rescue/pfl-minimal-visualizer`.
