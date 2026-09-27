# Behavior and performance framing contract

## Autonomous behavior

- **Piece** defines what renders.
- **Behavior** selects a capability-driven animation method profile (drift, pulse, orbit, …).
- **Creative macros** (Energy, Density, Motion, Chaos) modulate parameters on top of that profile.

Precedence:

1. Behavior picks an animation method and optional preset param nudges (via macro pass).
2. Macros remap density/chaos/exposure/zoom deterministically.
3. Advanced manual params remain overrides.

Behavior changes update `AnimationSpec` in place when possible (`preserveTime: true`) without rebuilding `LiveSession`. Construction/deconstruction methods may reset the performance clock.

Compatibility is derived from `animationCapabilitiesFor` and `animationMethodsForPiece`, not per-piece hardcoding.

## Performance framing

Default live post for Studio scenes:

- Full-bleed canvas (`fitStageViewport`, stage aspect ratio).
- **Vignette off** unless a piece/set explicitly sets `post.vignette`.
- Moderate bloom/feedback; no implicit circular scope mask.

Create, Rehearse, and Perform share the same live runtime and framing path.

Spatial coverage diagnostics (`spatialCoverageFromGrid`) flag scope-like concentration (high center occupancy, low outer) for human review — not an automatic fail.
