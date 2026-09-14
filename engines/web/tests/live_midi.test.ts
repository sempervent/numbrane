import { describe, expect, it } from "vitest";
import { MidiMapper, parseMidiBytes } from "../src/live/inputs/midi";

describe("MIDI parse + learn", () => {
  it("parses note/cc/clock/transport", () => {
    expect(parseMidiBytes(new Uint8Array([0x90, 60, 100]))).toEqual({
      kind: "note_on",
      channel: 1,
      note: 60,
      velocity: 100,
    });
    expect(parseMidiBytes(new Uint8Array([0xb0, 7, 64]) )).toMatchObject({
      kind: "cc",
      controller: 7,
      value: 64,
    });
    expect(parseMidiBytes(new Uint8Array([0xf8]))?.kind).toBe("clock");
    expect(parseMidiBytes(new Uint8Array([0xfa]))?.kind).toBe("start");
    expect(parseMidiBytes(new Uint8Array([0xfc]))?.kind).toBe("stop");
  });

  it("MIDI learn binds CC", () => {
    const m = new MidiMapper();
    m.startLearn("layer.a.opacity", "continuous");
    m.handle({ kind: "cc", channel: 1, controller: 11, value: 90 });
    expect(m.bindings).toHaveLength(1);
    const ev = m.handle({ kind: "cc", channel: 1, controller: 11, value: 127 });
    expect(ev[0]?.target).toBe("layer.a.opacity");
    expect(ev[0]?.value).toBeCloseTo(1);
  });

  it("note toggle", () => {
    const m = new MidiMapper();
    m.bindings.push({
      id: "t",
      type: "note",
      note: 36,
      target: "action.blackout",
      mode: "toggle",
    });
    const a = m.handle({ kind: "note_on", channel: 1, note: 36, velocity: 100 });
    expect(a[0]?.value).toBe(1);
    const b = m.handle({ kind: "note_on", channel: 1, note: 36, velocity: 100 });
    expect(b[0]?.value).toBe(0);
  });

  it("serializes bindings", () => {
    const m = new MidiMapper();
    m.bindings.push({
      id: "x",
      type: "cc",
      controller: 1,
      target: "post.exposure",
      mode: "continuous",
    });
    const j = m.toJSON();
    const m2 = new MidiMapper();
    m2.fromJSON(j);
    expect(m2.bindings[0]?.target).toBe("post.exposure");
  });
});
