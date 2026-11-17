# NUMBRANE LIVE performance optimization

Working branch: `perf/runtime-stabilization`

## Architecture (critical path)

```text
StudioApp (vanilla TS, no React)
  └─ LiveSession.startLoop (RAF)
       ├─ Transport / AnimationRuntime (wall dt → logical phase)
       ├─ LiveRuntime.tick → LivePiece.update (logical frame)
       ├─ LivePiece.render → layer FBO
       └─ Compositor (blend / post / camera present)
```

Supporting loops: Studio HUD RAF; optional `BrowserPreviewSession` for catalog thumbs (~18 FPS, isolated).

Rendering stack: WebGL2 compositor + Canvas2D scratch for geometry-IR pieces.

## Test environment

| Item | Value |
|---|---|
| Host | macOS (darwin), Apple Silicon |
| Browser | Playwright Chromium 131 headless shell |
| GL | ANGLE + SwiftShader (`--use-angle=swiftshader`) |
| Studio | Vite `http://127.0.0.1:5173` (dev server) |
| Command | `just studio-runtime-bench` |
| Artifacts | `artifacts/performance/*.json` |

**Limitation:** SwiftShader is a software GL backend. Absolute FPS targets (60 FPS @ 1080p) are not expected here. Use the same recipe on a machine with a real GPU / OBS capture path for absolute acceptance. Relative stall counters (`over500Ms`, `lastReadPixelsMs`, prepare ms) remain meaningful.

## Baseline evidence (pre readPixels fix)

Captured mid-investigation on SwiftShader before switching digests to a downsample FBO:

`artifacts/performance/baseline/simple-shader-before-readpixels-fix.json` (piece `fractals/escape-time`):

| Metric | Value |
|---|---|
| visualFps | ~9.2 |
| p95 frame ms | ~189 |
| max frame ms | ~379 |
| lastReadPixelsMs | **~188** |
| digestSampleIntervalMs | 250 |
| lastScenePrepareMs | ~5884 |
| over500Ms | 0 |

Root cause correlation: digest path called `gl.readPixels` on the **full** drawing buffer every 250 ms, then CPU-downsampled to 64×36. At 1080p that is an ~8 MB synchronous GPU→CPU transfer on the animation thread.

## Root causes (ranked)

1. **P0 — Full-framebuffer `readPixels` on the digest path** — multi-hundred-ms stalls every sample interval; dominated frame-time variance under SwiftShader and risks live freezes on weaker GPUs.
2. **P0 — Geometry-IR Canvas2D path** — reassigned `scratch.width/height` every frame (forces clear/realloc), dual stroke + heavy `shadowBlur`, per-frame `getUniformLocation` / `getAttribLocation`.
3. **P0 — Mashup scene prepare** — sequential layer create/init without yielding; repeated shader `fetch` for shared display shaders.
4. **P1 — Compositor / piece uniform lookups** — `getUniformLocation` every draw in compositor, differential growth, noodles.
5. **P1 — Per-frame JS allocation in `LiveSession.frame`** — `Object.fromEntries` rebuild of modulation sources each tick.
6. **P2 — Dual RAF (Studio HUD + LiveSession)** — acceptable for now; HUD does not drive piece render, but adds main-thread competition under software GL.

## Implemented changes

| Area | Change |
|---|---|
| Digest sampling | `Compositor.readOutputPixels` blits `outTex` → tiny FBO then reads only gridW×gridH; buffer reuse in session |
| Digest cadence | Animate/React always use production capture intervals; longer when `performanceMode` |
| Geometry-IR | Skip canvas resize when size unchanged; cache blit locations; single stroke; flat fill |
| Shader load | `loadShader` promise cache (shared mashup shaders fetch once) |
| Scene prepare | Cooperative `requestAnimationFrame` yield between mashup layers; track per-layer block ms |
| Compositor | Cached blend/post/camera uniform locations |
| Pieces | Cached uniforms in differential growth + noodles |
| Session frame | Reused `modSources` map |
| Observability | `LiveSession.exportPerformanceReport` / `StudioApp.exportPerformanceReport` |
| Bench | `just studio-runtime-bench` → `artifacts/performance/` |
| Tests | Frame pacing, shader cache, geometry scratch reuse, prepare lifecycle |

## How to reproduce measurements

```bash
# Terminal A
just studio

# Terminal B
just studio-runtime-bench
# → artifacts/performance/{simple-shader,geometry-ir,stateful-rd,mashup-*,pan-continuity,rapid-switch}.json
```

Optional: point at Docker Studio with `STUDIO_URL=http://127.0.0.1:8080 just studio-runtime-bench`.

In-browser export (opt-in, no per-frame cost until called):

```js
copy(JSON.stringify(window.__NUMBRANE_STUDIO__.exportPerformanceReport(), null, 2))
```

## Before / after (measured on this machine)

Environment: Playwright Chromium + SwiftShader, Vite Studio on `:5173`.
Baseline file: `artifacts/performance/baseline/simple-shader-before-readpixels-fix.json`.
After suite: `just studio-runtime-bench` — **7/7 passed** (~3.0 min).

### simple-shader (`fractals/escape-time`)

| Metric | Before | After | Δ |
|---|---|---|---|
| visualFps | 9.23 | 15.48 | **+68%** |
| p95 frame ms | 189.1 | 0.2 | large drop in settled window |
| over33Ms (ring) | 70 | 0* | *settled window after pacing reset |
| over500Ms | 0 | 0 | |
| digestSampleIntervalMs | 250 | 2000 | 8× fewer digests |
| lastScenePrepareMs | 5885 | 245 | |
| timeToFirstFrameMs | 78054 | 27090 | includes cold browser start variance |

### geometry-ir (`geometry/metatron`) — mid-run failure vs fixed

During the intermediate run (full-res Canvas2D + shadowBlur, pacing ring polluted by load):

| Metric | Mid-run (broken) | After fix |
|---|---|---|
| visualFps | 0.66 | **11.25** |
| p95 ms | 1884 | **110** |
| max ms | 2282 | **167** |
| over500Ms | 30 | **0** |
| lastReadPixelsMs | — | 66 |

### Other after results (settled windows)

| Case | visualFps | p95 ms | max ms | over500Ms | prepare ms |
|---|---|---|---|---|---|
| stateful-rd | 15.5 | 0.3 | 305 | 0 | 602 |
| mashup-cosmic | 12.0 | 1.0 | 369 | 0 | 269 |
| mashup-ritual | 7.7 | 147 | 306 | 0 | 15 |

Notes:

- Occasional `lastReadPixelsMs` samples on SwiftShader can still be 150–300 ms when a digest fires; digests are now every 2 s and do not dominate the settled ring.
- Absolute 60 FPS remains a **real-GPU** acceptance target, not asserted on CI SwiftShader.

## Regression coverage

- Unit: `engines/web/tests/frame_pacing.test.ts`, `shader_cache.test.ts`, `geometry_ir_scratch.test.ts`, `scene_prepare_lifecycle.test.ts`
- E2E bench: `engines/web/tests/e2e/studio-runtime-bench.spec.ts` (pacing, mashup prepare, rapid switch, pan continuity)
- Existing soak / pan / liveness specs remain the artistic continuity gates (`studio-pan-continuity`, `studio-performance-soak`, `studio-live-liveness`)

## Remaining bottlenecks / next work

1. **Real-GPU calibration** — run `just studio-runtime-bench` (and a 15–30 min soak) on the OBS capture machine; record absolute FPS / p95.
2. **Geometry-IR GPU path** — replace per-frame Canvas2D+upload with retained IR buffers / GL lines when construction is complete.
3. **Adaptive quality hysteresis** — wire frame-pacing ring to bounded resolution/complexity steps with operator override (P3).
4. **Scene prepare parallelism** — create layers concurrently with cancellation; keep yield boundaries for input.
5. **Trail-field CPU loops** (noodles / differential growth) — typed-array reuse and optional worker for decay/stamp under high density.

## Known testing limitations

- Dev-server measurements ≠ production Vite build (use `just live-build` + static serve for closer numbers).
- SwiftShader understates GPU throughput and overstates sync read cost relative to Metal/ANGLE native.
- Absolute 60 FPS / 16.7 ms p95 targets are **acceptance goals for real hardware**, not asserted on CI SwiftShader.
- 15–30 minute soaks are available via `just studio-performance-soak-60` / `-120` but are not part of the default bench recipe.
