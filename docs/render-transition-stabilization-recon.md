# Render + animation + transition stabilization recon

Branch: `feat/autonomous-scene-behaviors` (stabilization pass; feature freeze).

Date: 2026-09-26

## Human-reported defect classes

| Class | Symptom | Initial evidence |
|-------|---------|------------------|
| A. Non-render | Blank canvas / missing piece | Playwright: `audiovisual/nodes` soak not visible @ 5s; occasional pan sample luma &lt; 8 |
| B. Jump / reset | Camera/phase teleports | `applyAnimationMethodId` always `resetTime: true` on behavior/method change |
| C. Stutter | Uneven motion | Under investigation (frame pacing ring exists; macro input may rebuild scene) |
| D. Freeze / stall | Motion stops | Liveness watchdog false-positive on slow digest → recovery; calligraphy anim time lag vs wall clock |
| E. Transition | Snap / blank / wrong B | Morph render ignored interpolated params; different piece ids flipped at p=0.5 |

## Reproduction matrix (automated sentinel)

| Piece | CREATE animate | Long-run | Smooth (sentinel) | Transition | Failure signature |
|-------|----------------|----------|-------------------|------------|-------------------|
| geometry/circle-lattice | smoke CLI ✓ | not in E2E batch | — | — | — |
| mashups/attractor-calligraphy | E2E | FAIL anim time &lt; 55 @ 60s wall | motion OK early | not run | D: clock lag / false stall |
| fractals/strange-attractors | E2E scene | semantics mixed | hold tests fail on live continuous | — | export vs performance mode |
| fractals/sdf-raymarch2d | pan continuity | partial | black luma sample @ t=8.1 | — | A/D |
| geometry/metatron | liveness timeout | FAIL wait 12s | construction phase | — | D |
| audiovisual/nodes | soak FAIL @ 5s | — | — | — | A |
| Set fixture (4 scenes) | unit | morph opacities ✓ | — | dual morph added | E (params not applied — fixed) |

**Note:** “PASS” requires motion + time + visibility, not pixels alone.

## Clock model (authoritative)

| Clock | Owner | Live use |
|-------|-------|----------|
| **Performance / animation** | `AnimationRuntime.timeSec` ticked in `LiveSession.frame` from wall Δ (cap 0.25s) | CREATE / Rehearse / Perform live surfaces |
| **Performance mode** | `AnimationRuntime.performanceMode` | When true: unbounded time; cycle phase from `livePerformanceTimeAt` |
| **Export envelope** | `animationPhase` / hold-stop | Export + non-performance preview only |
| **Transition** | `SetOrchestrator` beat progress → morph progress | Independent of animation reset unless commit rebuilds pieces |
| **MIDI** | Transport beat | Quantization only; must not reset animation time on scene sync |

## Fixes in this pass (root-cause oriented)

1. **Method change:** preserve animation time except construction/deconstruction methods.
2. **Macro / behavior sliders:** push params to live pieces via `syncLiveParamsFromAuthoring` instead of full scene rebuild when `reloadScene=false`.
3. **Morph render:** apply morphed parameters to pieces; dual composite when source/destination piece ids differ (`morphDest`).
4. **Liveness watchdog:** treat advancing `animationTimeSec` as activity (avoid false stall on slow-changing digests).
5. **setAnimationSpec:** preserve `performanceMode` once enabled.

## Remaining / open

- `audiovisual/nodes` visibility (shader boot / piece-specific).
- Export hold/loop/ping-pong E2E vs live continuous normalization (test semantics).
- Transition commit feedback buffer continuity (needs targeted harness).
- Dev-only `?debugRender=1` diagnostics (optional follow-up).

## Merge recommendation

**NOT READY** until human re-checks representative CREATE → Rehearse → Perform transitions after this pass.
