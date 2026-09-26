# Set performance — UX recon (2026-09-26)

## Problem

Layer 1 (Generate / Animate / React) occupies the only top-level navigation. Layer 2 (Set → Rehearse → Perform) was embedded inside the narrow `#config` inspector (~360px), below piece/seed/export controls.

At 1280×800, a user must scroll the config column to reach **Rehearse** or **Enter Perform**. The sequence is a vertical list, not the central score object. Transition editing exposes runtime fields (quantization as “0 = immediate”, three morph duration inputs) simultaneously.

Keyboard help lists Generate/Animate/React commands but not workflow destinations, so help explains shortcuts for a hierarchy the UI does not show.

## DOM before change

| Element | Role |
|---------|------|
| `#modebar` | Generate / Animate / React (global) |
| `#config` | All CREATE editors + entire Set composer stack |
| `#set-score-chrome` | Floating perform/rehearse strip (easy to miss vs inspector) |
| `#stage-wrap` | Artwork (correct isolation target) |

## Target information architecture

```
CREATE | SET | REHEARSE | PERFORM     ← workflow nav
         Generate | Animate | React    ← sub-nav (CREATE only)

SET:     [score rail]  canvas  [context inspector]
REHEARSE / PERFORM: dedicated panels, primary action above the fold
```

Runtime (`SetScoreController`, orchestrator, persistence) unchanged; presentation and navigation move.

## Viewport / scroll audit (pre-fix)

| Viewport | Rehearse visible without scroll? | Perform visible? |
|----------|----------------------------------|------------------|
| 1280×800 | No — below transition fields | No |
| 1440×900 | Often no | No |
| 1920×1080 | Sometimes partial | No |

Primary fix: workflow tabs + split panels with internal scroll on inspector only.
