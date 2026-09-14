# MIDI (optional)

MIDI is **optional** external control for NUMBRANE LIVE. It is not required for microphone-driven performances.

Default transport is **internal BPM**. Audio analysis drives reactive modulation independently of MIDI.

## Capabilities (when enabled)

- Device discovery and reconnect (bindings use channel/CC/note numbers, not ephemeral object identity)
- Note on/off, CC, pitch bend
- Optional MIDI Clock, Start, Continue, Stop
- **MIDI Learn** — select a target, click Learn, move a control; binding is stored

Enable from the control UI section **Optional external control (MIDI)**. Until then, NUMBRANE does not request Web MIDI access.

## Optional clock sync

If you already use a MIDI clock source (hardware or software), you may route it into the browser via Web MIDI. This is an alternate transport — not the primary workflow.

On macOS, the system **IAC Driver** can expose a virtual MIDI port for optional clock/control. NUMBRANE does not require a DAW.

## Bindings

Portable JSON via `MidiMapper.toJSON()` / `fromJSON()`:

- CC → continuous parameter / opacity / modulation depth
- Note → trigger, toggle, scene, or cue

The `pfl-default` Set may declare optional cue notes for next/prev/blackout/panic/record. Scenes remain fully controllable from the UI and keyboard without MIDI.

## Failure modes

Missing devices, denied permission, unsupported `requestMIDIAccess`, or a disappearing clock must not crash the runtime. Visuals continue on internal transport and audio input (if available).
