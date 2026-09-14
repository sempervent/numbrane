# MIDI

NUMBRANE LIVE uses Web MIDI for control and transport sync.

## Capabilities

- Device discovery and reconnect (bindings use channel/CC/note numbers, not ephemeral object identity)
- Note on/off, CC, pitch bend
- MIDI Clock, Start, Continue, Stop
- **MIDI Learn** — select a target, click Learn, move a control; binding is stored

## Transport (Ableton-friendly)

Primary sync path:

```text
Ableton → MIDI Clock (+ CC/notes) → virtual MIDI port → Web MIDI → NUMBRANE LIVE
```

### macOS virtual port (example)

1. Open **Audio MIDI Setup** → Window → Show MIDI Studio
2. Dual create an **IAC Driver** bus (e.g. `IAC Driver Bus 1`)
3. In Ableton: enable sync to that port (MIDI Clock)
4. Route MIDI CC/notes to the same port for scene cues / Learn bindings
5. In the browser, allow MIDI; select the IAC port if prompted by the OS/browser

LIVE remains usable with **internal BPM** and **tap tempo** when no clock is present.

Clock is treated as a general transport source — not Ableton-specific in NAP.

## Bindings

Portable JSON via `MidiMapper.toJSON()` / `fromJSON()`:

- CC → continuous parameter / opacity / modulation depth
- Note → trigger, toggle, scene, or cue

The `pfl-default` Set ships cue notes (e.g. C3/C4-style indices in the set file) for next/prev/blackout/panic/record.

## Failure modes

Missing devices, denied permission, or disappearing clock must not crash the runtime; visuals continue on internal transport.
