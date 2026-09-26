# Autonomous scene authoring — recon (2026-09-26)

Branch for implementation: `feat/autonomous-scene-authoring` (from `main` @ `bd8e16f`).

## Product gap

CREATE (Generate / Animate / React) still exposes **implementation surface area**: per-piece parameter sliders, animation method pickers, export-oriented duration/end behavior, color ramps, locks, packs, and advanced meta axes. The performance workflow (Set → Rehearse → Perform) is mature; **scene construction before the show** remains the bottleneck.

Target principle: *Scene construction happens before performance. During performance, the scene should already know how to live.*

## Current CREATE architecture (evidence)

| Layer | Location | Role |
|-------|----------|------|
| Workflow | `#workflow-nav` + `#create-subbar` | CREATE vs Set/Rehearse/Perform; G/A/R submodes |
| Authoritative snapshot | `StudioDesiredState` (`desiredState.ts`) | piece, seed, params, color, animation methods, react sensitivity |
| Scene emission | `buildStudioSetDef()` | Ephemeral single-scene `SetDefV1` → `LiveSession.loadSet` |
| Set handoff | `buildCurrentSceneDefForSet()` + `SetScoreController.addScene()` | Adds current snapshot as catalog entry |
| Generate preview | API still / `#generate-preview` | Static or buffered frames — **not** live performance clock |
| Animate/React preview | `LiveSession` + `AnimationRuntime` | Same path as Rehearse when `normalizeSpecForLivePerformance` applied |
| Piece discovery | `#browser`, thumbs (`browserThumbs.ts`), motion pane | Curated filters; thumb pipeline varies by piece surface |
| Parameter presets | `presets.ts` (`ArtisticPreset`) | Per-piece named **look** presets (density/chaos/…) — Generate-oriented |
| Animation behaviors | `animation/methods.ts` | Camera + native methods; `defaultDuration: 8` on many camera methods — **export legacy** |
| Live performance norm | `animation/performance.ts`, `livePerformanceTime.ts` | Unbounded performance time; must stay on preview path |
| Seeds | `seed/library.ts` (IndexedDB), `cryptoSeed()`, prefs | Reproducible exploration; not yet first-class “Save Scene” |
| React | `audio/mappings.ts`, mic path | Feature → layer parameter maps; sensitivity profile |
| Compositions / mashups | `compositions.ts`, `mashups.ts` | Multi-layer Episode-style builds |
| Consistency guard | `consistency.ts`, scene generation tokens | Prevents stale loads / preview teardown leaks |

## Generate / Animate / React — actual roles (from code)

| Mode | Primary surface | Autonomous motion | Typical user intent today |
|------|-----------------|-------------------|---------------------------|
| **Generate** | API preview image | None (single frame / series) | Find a **still** look, export stills |
| **Animate** | Live GL + performance animation spec | Yes — `AnimationRuntime` + methods | Time-varying **performance** look |
| **React** | Live GL + audio features → mappings | Yes — same runtime + modulation | Audio-responsive performance |

**Interpretation for simplification (not a rewrite):**

- **Generate** → choose / refine **visual structure** (piece + seed + palette + preset look).
- **Animate** → choose **autonomous evolution** (behavior preset → animation method spec + performance clock).
- **React** → choose **responsiveness** (sensitivity + mappings); still needs a solid Animate baseline.

All three should feel like steps toward one **Scene** artifact, not three apps.

## Control taxonomy

### 1. Genuinely creative (keep on normal path)

- Piece / composition choice (visual foundation)
- High-level **behavior** (drift, pan, pulse, evolve — maps to `AnimationMethod` / native methods)
- **Energy / density / chaos** macros where they map to existing params (`density`, `chaos`, `zoom`, `hue` meta axes partially exist)
- Palette / color mode (solid, ramp, gradient)
- Seed + explicit Randomize / Again
- **Save Scene** / Add to Set (product language; today: “Add current scene from Create”)

### 2. Implementation detail (hide from normal path)

- Per-parameter sliders for every `paramSchema` field
- Export duration, end behavior (loop/hold/stop), fps, WebP/APNG format
- Animation **export** end behaviors on live path
- Layer opacity/blend unless composing
- Raw `launch_quantization_bars`-style fields (already fixed in Set editor)

### 3. Should become presets / defaults

- Piece-specific numeric defaults (`defaultsForPiece`, registry)
- `presets.ts` artistic presets (expand + unify naming as **Looks**)
- `animationMethodsForPiece` defaults (`defaultAnimationMethodId`) — bias toward **continuous** performance specs
- Poor legacy defaults (static camera hold @ 8s) → normalize via `normalizeSpecForLivePerformance`

### 4. Advanced (progressive disclosure)

- Full param schema sliders
- Animation method custom source/motion/end/easing
- Meta axes (organic/kinetic), locks
- PFL pack export, variant batch, SVG export
- Composition picker, mashup internals

### 5. Redundant / consolidate

- Duplicate mode bars (`#modebar` hidden vs `#create-subbar`)
- Generate “Animate This” vs switching to Animate workflow
- Multiple seed entry points (cfg-seed, randomize, Shift+R) — unify UX copy
- Preset dropdown in Generate vs artistic presets in params — single **Look** control

### 6. Should leave normal path

- Pack/Midnight fixture loaders in Create (keep dev/PFL tools under Advanced)
- Set composer controls (live only under SET workflow — already separated)

## Known historical pain (from prior work + code)

| Issue | Mitigation in tree | CREATE phase action |
|-------|-------------------|---------------------|
| 8s phase clamp | `normalizeSpecForLivePerformance`, tests | Ensure **preview** uses same normalization |
| Finite pan loop | Camera monotonic path / performance time | Behavior presets must prefer continuous/endBehavior |
| Preview ≠ Perform | Two surfaces (API vs live) | Animate preview = live session; Generate still static by design |
| Piece thumb gaps | Browser thumb audit tests | Improve animated thumb / motion pane coverage |
| Config race / stale scene | Transactional apply, generation tokens | Preserve; add Scene save tests |
| Geometry/size awkwardness | Piece-specific params | Geometry macro + Advanced detail |
| Only some pieces “work” | Catalog curated filter | Discovery UX + sane defaults per family |

## Existing assets to reuse (do not fork)

- `StudioDesiredState` → persisted **Scene recipe** (extend, don’t duplicate)
- `buildStudioSetDef` / `SceneDef` catalog entries in Set 0.2.0
- `ArtisticPreset` / `presetsForPiece` → **Look** presets
- `AnimationMethod` registry → **Behavior** presets (data-driven mapping)
- `moreLikeThis` / variants (`explore/variants.ts`) → seeded exploration
- `StudioSeedRecord` → optional deep state; Scene should at minimum store seed + desired snapshot
- `setPerformance.ts` persistence patterns for Sets → mirror for **saved Scenes** library if needed

## Proposed CREATE information architecture (next increment)

```
CREATE
  Visual     → piece browser + composition (optional)
  Look       → artistic preset + palette
  Behavior   → Animate: method preset (continuous-first)
  React      → sensitivity + enable mic (React submode)
  Macros     → Energy / Density / Complexity (deterministic maps)
  Actions    → Randomize · Preview · Save Scene · Add to Set
  Advanced   → full param schema, export, animation export, locks
```

Preview in Animate/React must call the **same** `applyDesiredScene` + performance clock path used when a scene is referenced from a Set.

## Episode 1 / Midnight reality check

- Use existing `pieces/live/midnight-pfl-pack`, mashups, and pack loaders as **reference content**, not UI clutter.
- Acceptance path: author one Animate scene from a Midnight-adjacent piece → Save Scene → add to Set → Rehearse (no new Episode 1 pipeline).

## Out of scope (this phase)

Set orchestrator, Rehearse/Perform UX redesign, branching sets, song timeline, DAW, node graph, full MIDI mapping UI, renderer rewrite.

## Implementation sequencing (planned commits)

1. Scene model + persistence contract (recipe round-trip)
2. CREATE panel simplification (macros + Advanced collapse)
3. Behavior preset table wired to `AnimationMethod` + performance norm
4. Save Scene + CREATE → SET handoff polish
5. Browser preview / discovery improvements
6. Tests (unit + Playwright CREATE → Set → Rehearse) + Episode 1 spot check

## Open questions (to resolve in design, not block recon)

- Single shared **Scene library** localStorage vs only Set catalog?
- Whether Generate-mode saves are stills-only Scenes or require “promote to Animate”
- Minimum macro set that maps across ≥80% of curated catalog without per-piece special cases
