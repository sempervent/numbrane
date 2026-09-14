# NUMBRANE LIVE

NUMBRANE LIVE is a real-time visual performance instrument for Positive Feedback Loop and similar live music setups.

Primary path:

```text
MacBook microphone (or any browser audio input)
            |
            v
       Web Audio analysis
            |
            v
       NUMBRANE LIVE
            |
     generative scenes + modulation
            |
            v
    display / optional OBS
```

No Ableton, MIDI, DAW, or OBS is required. OBS is an optional output target only — it does not carry audio into NUMBRANE.

No AI, ML, or external generative services. Analysis and visuals are algorithmic / procedural / human-controlled.

## Startup

```bash
just live
```

1. Open the printed URL (`http://127.0.0.1:5173/live.html`).
2. Allow microphone / audio access when the browser asks.
3. Select an input (built-in mic, interface, mixer feed, or any OS-exposed input).
4. Confirm the input meter moves.
5. Perform with the loaded `pfl-default` Set (scenes via UI or ←/→).
6. Optionally open the OBS / display output page, or fullscreen the canvas on another screen.

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
- **Cue** — scene/blackout/panic/record actions (keyboard / UI; optionally MIDI-bound)
- **Transport** — logical BPM/beat/bar/phase. **Default: internal BPM.** Optional MIDI Clock. Audio reactivity does not require tempo.

Art consumes logical `frame`, `t`, `dt`, `beat`, `bar`, `phase` — not wall clock.

## Audio inputs

Any device the browser lists after permission, including:

- MacBook / MacBook Air built-in microphone
- USB audio interface
- mixer / interface feed
- aggregate devices
- OS loopback / virtual inputs when the OS exposes them as audio inputs

NUMBRANE does not hard-code device names. Denied audio access is not a failure: visuals continue with internal transport and LFOs; audio modulators stay at neutral zero and the UI shows **No audio input**.

## Optional external control (MIDI)

MIDI Learn and MIDI Clock are optional advanced features. See `docs/midi.md`. The happy path never requires MIDI.

## Output

- Control UI + canvas on one display
- Fullscreen / second display without OBS
- Optional OBS Browser Source: see `docs/obs.md`

## Quality & resolution

Manual profiles: `low` · `medium` · `high` · `ultra`.

Presets: `1920x1080`, `3840x2160`, `1080x1920`, `1080x1080`.

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
