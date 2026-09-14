# Performance recording & replay

Live microphone PCM is **not** treated as deterministic.

Instead, NUMBRANE LIVE records the **analyzed, normalized feature stream** that drove modulation, plus control events.

## Recorded

- Base Set definition
- Seed / fps
- Transport-related control events
- Scene cues and optional MIDI-mapped control events
- Parameter / mapping events
- Normalized audio-feature frames (`energy`, bands, onset, …)

## Not recorded

- Raw audio samples
- Copyrighted audio files

## Replay

```text
recorded feature stream + events → same modulation / scenes → reproducible visuals
```

No live audio or MIDI hardware required. Tone.js is not required for visual replay.

Optional: play a user-selected local audio file alongside replay for review (never committed as fixtures beyond tiny synthetic test signals).

## Smoke

```bash
just live-smoke
```

Writes `artifacts/live-smoke/smoke-performance.json` and a semantic digest.
