# PFL performance session (Studio)

NUMBRANE Studio is oriented around **animated performance**, not equal-weight still generation.

## Current selection flow (before this pass)

1. Open browser (`B`) — flat list, family chips, tiny 160×90 thumbs for **first 8** pieces only.
2. Click piece — loads current mode (often Generate).
3. No density/motion/midnight cues; weak pieces look the same as strong ones in the list.
4. Pack/sequence via config panel; Midnight fixture buried in pack UI.

**Friction:** previews are slow, incomplete, and still-first; user cannot judge motion or PFL suitability from the browser.

## Performance-first flow (target)

```
Browse visually (curated catalog + badges)
  → preview poster + motion/density tags
  → ★ shortlist
  → Animate (one click)
  → add to pack / Episode 1 fixture
  → rehearse ] [ transitions
  → live OBS or export loops
```

## Browser filters

| Filter | Use |
|--------|-----|
| **curated** | Default — showcase + curated animated pieces |
| **shortlist** | Your ★ performance picks (persisted) |
| **midnight** | Midnight-role visuals |
| **dense / calm / intense** | Mood filtering |
| **geometry** | Construction / sacred pieces |

Catalog source: `engines/web/src/studio/performance/catalog.ts`.

## Episode 1 & Midnight

- **Episode 1 flow:** `PFL_EPISODE_1_FLOW` in catalog TS; pack fixture `pieces/pfl/episode-1-visual-set/pack.json`.
- **Midnight roles:** `MIDNIGHT_ROLES` + expanded `pieces/pfl/midnight-pfl-pack/pack.json`.

## Motion preview (browser)

- **Poster** — live capture for browser-native pieces (matches Animate); `/api/render` for api-preview stills.
- **Hover/focus a card** (~320ms) — single **motion preview pane** (480×270, ~18 FPS, one piece at a time).
- **Reduced motion** — motion pane disabled; posters and **Animate** still available.

## Production output (Episode 1)

**Recommended hybrid:**

1. **Live playback** in Animate — primary rehearsal (Tab hide chrome, `]`/`[` navigate).
2. **Pack order cycling** — load Episode 1 set → browser **cycle pack order** → `]`/`[` follow pack sequence.
3. **OBS capture** — 1920×1080 canvas, **Window Capture** on Studio stage (Tab hides chrome); 30 or 60 FPS; NV12/standard encoder; no Studio UI in frame.
4. **Pack export** — WebP loops when Docker renderer is up; use **preview** first for RD/stateful items.

Live Animate is strong for shader-native and geometry-ir pieces; stateful RD exports are heavier — capture live or export short preview segments first.
