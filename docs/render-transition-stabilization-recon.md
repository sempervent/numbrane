# Render + animation + transition stabilization recon

Branch: `feat/autonomous-scene-behaviors` (stabilization pass; feature freeze).

Dates: 2026-09-26 (pass 1), 2026-09-27 (pass 2 — visual continuity)

## Human-reported defect classes

| Class | Symptom | Status after pass 2 |
|-------|---------|------------------------|
| A. Non-render | Blank canvas / missing piece | **Fixed** — `audiovisual/nodes` time uniforms + E2E enter order |
| B. Jump / reset | Camera/phase teleports | **Improved** — live clock preserved on method/macros (pass 1) |
| C. Stutter | Uneven motion | **Partial** — browser thumb previews paused during set perform |
| D. Freeze / stall | Motion stops | **Improved** — watchdog uses animation advance; perf-mode dt cap 2s |
| E. Transition | Snap / blank / wrong B | **Improved** — morph params + dual composite; monotonic morph E2E |

## Live vs export contract

| Surface | Clock | End behavior |
|---------|-------|----------------|
| **Live Animate / Perform** | `performanceMode=true`, unbounded `animationTimeSec`, repeating `cyclePhase` | Hold/stop/loop/ping-pong affect **cycle** motion, not terminal freeze |
| **Export / envelope lab** | `performanceMode=false`, finite `exportPhase` | Hold/stop freeze at duration; loop/ping-pong wrap in export phase |
| **E2E export semantics** | `StudioApp.exportEnvelopeLab=true` skips `normalizeSpecForLivePerformance` | Tests in `studio-animation-semantics.spec.ts` |

## E2E harness

| Issue | Fix |
|-------|-----|
| Connection refused after mid-suite death | Playwright owns dev server; readiness URL `studio.html`; `reuseExistingServer` only when `PW_REUSE_SERVER=1` (not default locally) |
| Port 5173 already used | Kill orphan Vite or use managed server (default) |
| Regression | `studio-server-health.spec.ts` |

## Reproduction matrix (automated sentinel)

| Piece / area | Result |
|--------------|--------|
| audiovisual/nodes + reference | E2E **PASS** (digest + animation time) |
| fractals/sdf-raymarch2d pan | E2E **PASS** (visibility, not mean luma) |
| set-performance-fixture morph | E2E **PASS** (per-edge monotonic progress) |
| mashups/attractor-calligraphy 60s | E2E **PASS** (wall-window clock advance ≥48s, motion) |
| geometry/metatron post-construction | E2E **PASS** |
| animation semantics (hold/loop/construction) | E2E **PASS** (export envelope lab) |
| npm unit | **214** passed |

## Pass 1 fixes (commits `76b6d7c` … `11629ec`)

1. Method change: preserve animation time except construction/deconstruction.
2. Macro / behavior: `syncLiveParamsFromAuthoring` without full rebuild.
3. Morph render: interpolated params; dual composite for different piece ids.
4. Liveness watchdog: `noteAnimationAdvance`.
5. Unit tests + this doc (initial).

## Pass 2 fixes (uncommitted → next commits)

1. **nodesLive:** `u_time` from performance/animation time.
2. **studioUi:** animate before piece select in `enterAnimateViaUi`.
3. **exportEnvelopeLab:** finite envelope tests without live normalization.
4. **session:** performance-mode animation dt cap 2.0s (reduces wall-clock lag under load).
5. **app:** suspend browser thumb previews when set score surface ≠ idle.
6. E2E: pan visibility, transition continuity, server health, semantics, liveness thresholds.

## Remaining / open (human visual review)

- **Transition commit boundary:** runtime identity + feedback/history at 100% → ACTIVE(B) first frame (instrumentation harness, screenshot matrix not fully automated).
- **Parameter morph kinds:** cyclic hue / discrete enums — naive lerp only today.
- **Transition pair matrix:** manual review of representative A→B pairs (see `tmp/visual-continuity-review/` when generated locally).
- **Full Studio E2E matrix** (`studio-all-animation`, piece contract batch): not re-run in pass 2.

## Human review artifacts

Generate locally (gitignored):

```bash
mkdir -p tmp/visual-continuity-review
# Recommended: run sentinel E2E with Playwright trace, or capture from Studio Perform transitions.
```

Review order: running nodes → calligraphy 60s clip → set fixture morph → incompatible-piece morph in Rehearse.

## Merge recommendation

**READY FOR HUMAN VISUAL REVIEW** — automated sentinels green; transition commit equivalence and broad transition matrix still require human eyes. **NOT READY TO MERGE** until visual sign-off.
