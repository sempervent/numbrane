# Audio reactivity

NUMBRANE LIVE's primary live input is a browser audio device (built-in microphone, interface, mixer feed, or any OS-exposed input).

## Pipeline

```text
device → AnalyserNode → DSP features → adaptive normalization → modulation sources
```

Typical PFL path: **MacBook microphone → NUMBRANE LIVE → display / OBS**.

Features (normalized toward `[0,1]` where applicable):

| Signal | Role |
|--------|------|
| `audio.energy` | RMS energy |
| `audio.peak` | Peak amplitude |
| `audio.low` / `mid` / `high` | Band energies |
| `audio.centroid` | Spectral centroid |
| `audio.flux` | Spectral flux |
| `audio.onset` | DSP onset pulse |
| `audio.rolloff` | Spectral rolloff |
| `audio.zcr` | Zero-crossing rate |

Normalization uses adaptive floor/ceiling, attack/release envelope, optional log mapping, and sensitivity so quiet and loud material both modulate expressively.

The `pfl-default` Set maps these differently per scene (bands, onsets/envelopes, centroid, flux, slow smoothed energy) — not amplitude→brightness alone.

## Latency

Approximate analysis latency is exposed in status (`latencyMs` ≈ FFT window / sample rate). Prefer stability over promising zero latency.

## No audio permission

If the browser denies microphone access, LIVE continues:

- internal transport
- LFOs and scene navigation
- generative animation

Audio-reactive modulators use neutral zeros. The UI shows **No audio input** without treating it as an application failure.

Optional MIDI is independent and also not required.

## Advanced routing

Advanced users may expose DAW or system audio through an OS audio-routing / loopback device **if** the OS presents it as a normal audio input. NUMBRANE treats it as a generic input — no DAW-specific integration.

## Tests

Synthetic signals (sines, impulses, silence) validate band relationships and onset detection — see `engines/web/tests/live_audio.test.ts` and the audio→modulation path test.
