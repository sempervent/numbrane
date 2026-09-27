# CREATE mode contract: Generate, Animate, React

## Product answer

| Mode | Creative role | Studio behavior |
|------|---------------|-----------------|
| **Generate** | Choose or fix the **visual state** (recipe, layers, parameters, seed) | Show that state **immediately** as an interactive preview |
| **Animate** | Same state, **continuous autonomous motion** | Same browser runtime + `AnimationRuntime` |
| **React** | Same state, **audio-driven modulation** | Same runtime + react mappings |

Generate is **not** “wait for Python to finish a poster.” Export and high-quality stills remain separate actions.

## Implementation surfaces

| Class | GENERATE surface | User expectation |
|-------|------------------|------------------|
| `interactive` | Live WebGL/compositor (frozen still) | First pixels in seconds |
| `async-python` | `/api/render` progressive draft → preview | Staged status; optional refine; export for final quality |

Any piece with a **browser-native ANIMATE** backend uses that same runtime for GENERATE:

| Tier | Policy | Behavior |
|------|--------|------------|
| **immediate** | `geometry-ir`, `shader-native`, `wasm` | Load + paint frozen still |
| **warmup** | `webgl-stateful` sims | Chunked logical warm-up, then pause |
| **async** | No live ANIMATE | `/api/render` with staged status |

Mashups follow the same rules via `resolveGeneratePolicy()` — not a special case.

## Attractor Calligraphy Mashup (root cause)

**Before:** registry routed GENERATE to `python-api` while ANIMATE used `shader-native` live compositor. UI showed “Draft…” on `/api/render`, which composited two heavy Python renders sequentially — multi-minute waits.

**After:** GENERATE uses the same live mashup stack as ANIMATE (simulation paused, canvas visible). High-quality export still available via Export controls.

## Differential Growth (second root cause)

**Before:** Registry still routed GENERATE to `python-api` while ANIMATE used `webgl-stateful` live sim. UI showed “Quick preview…” for minutes; faint Python draft was not useful.

**After:** Capability routing sends GENERATE to live sim + **deterministic warm-up** (`runGenerateWarmup`). Generate → Animate reuses loaded scene (no sim reset). Export/Python remains offline-only.

## UX status (python-async pieces)

- “Quick preview…” → coarse `/api/render` draft
- “Preview ready — refining…” → draft visible, full preview in flight
- “Refining preview…” → full preview request

Live interactive pieces do not use `#gen-status` for normal loads.

## Continuity

Generate → Animate preserves `pieceId`, `seed`, params, and loaded scene. Animate → Generate shows the same authored state (frozen), without re-running Python unless params/seed change on an async-python piece.
