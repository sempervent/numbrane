# Set performance — recon & design (2026-03-26)

## Branch context

- Working branch: `fix/studio-performance-hardening` (Studio scene apply hardening, consistency tests).
- Recent performance work on `main`: layered live compositor (#11), PFL catalog (#10), live animation regressions (#9, #7).

## Existing representations

| Concern | Source of truth today |
|--------|------------------------|
| Scenes / layers | `SetDef.scenes[]` → `SceneDef` with `LayerDef`, `post`, `modulation` (`engines/web/src/live/types.ts`) |
| Studio “scene” | `StudioDesiredState` → `buildStudioSetDef()` produces a **single-scene** ephemeral set (`desiredState.ts`) |
| Pieces | Catalog ids; live instances via `createLivePiece` + `LiveSession.prepareScenePieces` |
| Geometry | Piece parameters + construction animation component |
| Animation spec | `AnimationSpec` + `AnimationRuntime` (session-wide; overlay runtimes per compositor layer) |
| Performance time | `livePerformanceTimeAt` + `performanceMode` on `AnimationRuntime` (unbounded vs export envelope) |
| Performance mode (Studio) | Animate/React with `normalizeSpecForLivePerformance`, `applyStudioPerformanceClock` |
| Camera | `cameraViewAtPerformanceTime` (live) vs `interpolateCamera` (export phase) |
| Preview | `BrowserPreviewSession` — separate short-lived `LiveSession` |
| Full-screen / OBS | `live-output.html` (`outputOnly`), Studio Tab chrome hide + `fitStageViewport` |
| MIDI | `Transport` (internal / midi-clock / replay), `MidiInputManager`, cues on `SetDef.cues` |
| Saved sets | `pieces/live/*/set.json`, schema `spec/schema/live-set.schema.json` v0.1.0 |
| Seeds | Layer `seed`, Studio `seed`, deterministic `mulberry32` in sequencers |

## Runtime path (today)

**NUMBRANE LIVE:** fetch set → `LiveSession.loadSet` → `prepareScenePieces` → `commitPreparedScene` → RAF `frame()` → transport tick → `AnimationRuntime.tick` → `LiveRuntime.tick` → pieces `update` → `renderFrame` (single scene, crossfade-style transition flags only).

**Studio Animate:** `applyDesiredScene` → `buildStudioSetDef` → same `loadSet` path. Piece changes use DOM crossfade (`pieceTransition`), not structural morph.

**Gap:** `LiveRuntime.gotoScene` immediately sets `sceneIndex` and `LiveSession` **rebuilds** pieces — hard cut. Transition progress only scales opacity / post (crossfade, fade-through-black), not continuous parameter/state morph. No queue, dwell, auto-advance, or edge config.

## Regression inventory (addressed on branch / tests)

| Issue | Mitigation in tree |
|-------|---------------------|
| Export duration / phase clamp ~8s | `normalizeSpecForLivePerformance`, `livePerformanceTimeAt`, `live_performance_time.test.ts`, liveness census |
| Camera pan wrap | `cameraViewAtPerformanceTime` monotonic path; e2e pan continuity |
| Animation reset on sync | `setAnimationSpec({ preserveTime })`, studio performance clock |
| Pieces disappear after config | Transactional `applyDesiredScene`, generation tokens, `StaleSceneLoadError` |
| Preview teardown | `BrowserPreviewSession` isolation tests |
| Mashup layer runtimes | `overlayAnimationRuntimes` + per-layer specs |
| Borders / full bleed | `fitStageViewport`, full-bleed e2e |

Set performance must **not** reintroduce: scene load resetting global performance time mid-show; queued destinations instantiating pieces; export `durationSec` driving live envelopes.

## Extend vs retire

**Extend (do not fork):**

- `SetDef` / live-set schema (versioned edges + scene catalog)
- `LiveRuntime` → embed **`SetOrchestrator`** (explicit state machine)
- `LiveSession` → dual-scene morph render + non-destructive rehearsal/capture hooks
- `Transport` + existing MIDI (quantization boundaries)
- Studio: new **Set** mode alongside Animate authoring (sparse perform UI)

**Retire as primary perform path (keep for authoring):**

- Studio `pieceTransition` crossfade as **primary** show transition (remains fallback only for incompatible backends)
- Implicit “next scene = destination’s `transition` field” as sole edge model (mapped into edges for 0.1.0)

## Architecture

```
SetDefinition (persisted, versioned)
  sequence + scene_catalog + edges

SetOrchestrator (pure, testable)
  active | queued | transitioning | dwell lock
  tick(transport, musicalAvailable)
  advance() / seekRehearsal(entry)

SetRuntimeSession (LiveSession)
  performanceTime (monotonic AnimationRuntime)
  fromPrepared + toPrepared during morph
  SceneMorph blend → compositor

SceneRuntime
  LivePiece update/render (both sides animate during morph)
```

### State machine semantics

- **ACTIVE(A):** pieces = A only; autonomous animation; optional auto-advance timer from edge.
- **Advance → B (manual, quant):** **QUEUED(B)** — B not loaded.
- **Replace queue B→C before launch:** **QUEUED(C)** only.
- **Quant boundary / immediate:** **TRANSITIONING(A,B)** — instantiate B, both update/render.
- **Mid morph request C:** finish **A→B**, **ACTIVE(B)**, **minimum dwell**, then **TRANSITIONING(B,C)**.
- **ACTIVE(B)** after morph: genuine B state (not waypoint).

### Continuous morph

- Numeric layer params, opacity, transform, post, seeds (linear / smoothstep on transition progress).
- Layer id in both: interpolate; only-from: opacity × (1−p); only-to: opacity × p (birth/death).
- Camera: interpolate between evaluated camera views at shared performance time (both scenes keep `performanceMode` clocks).
- Piece type change: parallel render + opacity crossfade of layer outputs (not a hard cut); modulation uses blended bases.
- **Not yet continuous:** feedback buffer contents (reset on commit), discrete enum piece swaps (treated as crossfade of raster output), construction jump when target construction phase differs (hold target construction at min(1, p)).

### MIDI / free time

- `time_mode: musical` uses beats/bars when transport healthy + midi-clock or internal play.
- On MIDI loss: degrade to wall/internal beat; morph uses `duration_seconds` if beats unavailable — **no freeze, no reset** of performance time.

### Rehearse vs perform

- Same orchestrator + session path; `executionMode: rehearse | perform`.
- Rehearse holds **draft** overlay on set (local); persist only on explicit apply.
- Entry: `seekRehearsal({ kind: 'start' | 'scene' | 'beforeTransition', index })` with deterministic scene-entry seeds documented in `sceneCapture.ts`.

### Capture

- `captureMorphSnapshot()` → `SceneDef` candidate (layers + params + post + seeds + animation method ids), does not mutate set.

### Full-screen

- Operational UI on control surface only; canvas/OBS path unchanged (`outputOnly`, no HUD on output page).

## Studio UI (implemented)

| Layer | Navigation | Workspace |
|-------|------------|-----------|
| **Create** | `#workflow-nav` → Create; `#create-subbar` → Generate / Animate / React | `#config` (visual authoring) |
| **Set** | `#workflow-nav` → Set | `#set-score-rail` (score chain) + `#set-inspector` (contextual transition/scene) |
| **Rehearse** | `#workflow-nav` → Rehearse | `#rehearse-panel` — primary **Rehearse** control above the fold |
| **Perform** | `#workflow-nav` → Perform | `#perform-panel` — primary **Advance** when running |

- **Status view-model:** `setScore/statusView.ts`
- **Persistence:** `SetScoreController` + `setPerformance.ts` localStorage
- **Dev-only:** fixture load when `import.meta.env.DEV` or `?dev` (`studio/workflow.ts`)
- Tab / `controls-hidden` hides all workflow chrome; `#stage-wrap` stays artwork-only

## Persistence

- `protocol_version` **0.2.0**: optional `scene_catalog`, `sequence`, `edges[]`.
- **0.1.0** sets: `resolveSetModel()` builds sequence from `scenes[]` and edges from each scene’s incoming `transition` + manual advance defaults.

## Deferred

- Absolute song timeline (bar 17 → bar 49) — edge model reserves `advancement: { mode: 'timeline', ... }` without implementing.
- Branching sets.
