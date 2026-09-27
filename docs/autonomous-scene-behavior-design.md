# Autonomous Scene behavior — design addendum

Branch: `feat/autonomous-scene-behaviors` (from `main` @ Scene authoring merge).

## 1. Implicit behavior concepts today

- **Animation methods** (`animation/methods.ts`) — camera pans, parameter drift, construction, native piece motions.
- **Artistic presets** (`presets.ts`) — static look bundles per piece family.
- **Performance normalization** (`animation/performance.ts`) — continuous live clock, unbounded semantics.
- **Scene recipe** — persists piece, params, method ids, and full `animationSpec`.

## 2. Shared macros (this increment)

Four semantic axes on `[0, 1]`:

| Macro | Intent |
|-------|--------|
| **Energy** | Rate / amplitude — animation speed feel, exposure, kinetic meta |
| **Density** | Visual fill — `density` param + meta.density |
| **Motion** | Camera / spatial motion — method selection bias, zoom, kinetic meta |
| **Chaos** | Perturbation — `chaos` param + meta.chaos |

Piece-specific tables in `creativeMacros.ts` clamp to each param schema bound.

## 3. Unsupported macros / behaviors

- Behaviors declare `families` + optional `pieceIds`; compatibility returns reason string.
- UI disables incompatible presets with `title` tooltip.
- Fallback: keep current method/spec unchanged.

## 4. Data-driven presets

`behaviorPresets.ts` maps preset id → `{ animationMethodId, optional param deltas }` then runs through `normalizeSpecForLivePerformance`.

## 5. Reproducibility

- Macros + behavior id stored on recipe (`authoring` block).
- Variation uses `variationSeed` derived from `mixSeed(sceneSeed, salt)` — no `Math.random`.
- Applying macros **recomputes** mapped params (manual override deferred: macro changes replace mapped fields).

## 6. Piece browser (increment scope)

- Show catalog **family** under title (from `familyOf`).
- Existing thumb / motion pipeline unchanged; filter `<select>` by family when ≥8 pieces visible.

## Manual override rule (v1)

Changing a macro recomputes all macro-mapped parameters. Advanced sliders remain authoritative until the next macro change.

## Known limitations

- No full visual preset marketplace; no MIDI/timeline; no cloud library sync.
