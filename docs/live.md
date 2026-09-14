# NUMBRANE LIVE

NUMBRANE LIVE is a real-time visual performance instrument. It turns generative pieces into layered, modulatable scenes driven by audio analysis, MIDI, and logical transport — for live music with Positive Feedback Loop and similar setups.

```text
live music / Ableton / instruments
            |
            v
    audio + MIDI + transport
            |
            v
       NUMBRANE LIVE
            |
     generative scenes + modulation
            |
            v
       OBS / display
```

No AI, ML, or external generative services. Analysis and visuals are algorithmic / procedural / human-controlled.

## Launch

```bash
just live
```

Open the printed URL (default `http://127.0.0.1:5173/live.html`).

Control UI loads the `pfl-default` Set. OBS-only output:

```text
http://127.0.0.1:5173/live-output.html?set=pfl-default
http://127.0.0.1:5173/live-output.html?set=pfl-default&alpha=1&res=1920x1080&scene=collapse
```

## Keyboard

| Key | Action |
|-----|--------|
| Space | Start/stop internal transport |
| ← / → | Previous / next scene |
| B | Blackout toggle |
| R | Record toggle (download JSON on stop) |
| Esc | Panic / safe reset |
| H | Toggle performance HUD |

## Concepts

- **Piece** — generative artwork (catalog algorithm)
- **Layer** — piece instance with opacity, blend, parameters, modulation
- **Scene** — composed layers + post FX + modulation
- **Set** — ordered scenes for a performance (`pieces/live/<id>/set.json`)
- **Cue** — scene/blackout/panic/record actions (MIDI-bindable)
- **Transport** — logical BPM/beat/bar/phase (`internal` \| `MIDI Clock` \| `replay`)

Art consumes logical `frame`, `t`, `dt`, `beat`, `bar`, `phase` — not wall clock.

## Quality & resolution

Manual profiles: `low` · `medium` · `high` · `ultra` (particles / sim / bloom cost).

Presets: `1920x1080`, `3840x2160`, `1080x1920`, `1080x1080`.

Target: 1080p @ 60 fps on ordinary desktops; usable at 30 fps on weaker hardware.

## Blackout & panic

- **Blackout** — output goes black/transparent; state preserved
- **Panic** — clears feedback runaway, stuck envelopes, extreme exposure; keeps the app running

## Developer commands

```bash
just live
just live-build
just live-test
just live-smoke
just live-e2e
just live-pfl
```
