# Set performance UI — recon update (2026-09-26)

## Studio flow today

| Step | Mechanism |
|------|-----------|
| Scene build | `StudioDesiredState` → `buildStudioSetDef()` → `LiveSession.loadSet` (single-scene 0.1.0) |
| Animate/Perform | `#modebar` animate/react; `#performance-strip` in **stage-wrap** cycles **pieces** (`cyclePiece`, `]`) |
| Playback | `session` RAF + `playing`; transport on `LiveRuntime` |
| Full-screen art | Tab hides `#chrome`; `body.controls-hidden` hides modebar/config/strip; canvas `#stage` full-bleed |
| Preview | Separate `BrowserPreviewSession`; main stage owns authoritative `LiveSession` |

## Smallest UI architecture

- **`SetScoreController`** — authoritative **SetDefV2** document + localStorage via existing `setPerformance.ts` helpers; rehearsal draft via orchestrator API (no parallel model).
- **`buildSetStatusView(session)`** — single view-model for composer, rehearse, perform chrome.
- **Composer UI** — section inside `#config` (`details#set-score-panel`); does not replace piece authoring.
- **Perform/Rehearse chrome** — new `#set-score-chrome` in `#chrome` (not in `#stage-wrap`); artwork stays clean when Tab hides chrome.
- **Runtime commands** — `advanceSet`, `seekRehearsal`, `captureMorphScene`, `setSetExecutionMode`; UI only renders orchestrator snapshot.

## Edge reorder rule

Edges are indexed by outgoing scene order. On reorder, preserve edge config when the same `(fromId → toId)` pair remains adjacent; otherwise apply schema defaults for new adjacency.

## Keyboard

When Set perform/rehearse active: `]` / `→` → `advanceSet()` (same as Advance button). Existing piece-cycle handlers skipped while set runtime owns the session.

## outputOnly

Studio page remains `outputOnly: false`. Isolation tested by asserting no set-score nodes under `#stage-wrap` and hidden chrome when `controls-hidden`.
