# Audio reactivity

NUMBRANE LIVE analyzes an audio input device (interface, mixer feed, mic, or OS loopback when exposed) with Web Audio.

## Pipeline

```text
device → AnalyserNode → DSP features → adaptive normalization → modulation sources
```

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

## Latency

Approximate analysis latency is exposed in the control status (`latencyMs` ≈ FFT window / sample rate). Prefer stability over promising zero latency. Larger FFT windows improve frequency resolution and increase delay.

## Permissions

If the browser denies microphone access, LIVE continues with internal transport and non-audio modulators (LFOs, MIDI, transport).

## Tests

Synthetic signals (sines, impulses, silence) validate band relationships and onset detection — see `engines/web/tests/live_audio.test.ts`.
