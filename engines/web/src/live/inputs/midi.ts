/**
 * Web MIDI message parsing and learn/bindings.
 */

export type MidiMessage =
  | { kind: "note_on"; channel: number; note: number; velocity: number }
  | { kind: "note_off"; channel: number; note: number; velocity: number }
  | { kind: "cc"; channel: number; controller: number; value: number }
  | { kind: "pitch_bend"; channel: number; value: number }
  | { kind: "clock" }
  | { kind: "start" }
  | { kind: "continue" }
  | { kind: "stop" }
  | { kind: "unknown"; status: number };

export function parseMidiBytes(data: Uint8Array): MidiMessage | null {
  if (!data.length) return null;
  const status = data[0]!;
  if (status === 0xf8) return { kind: "clock" };
  if (status === 0xfa) return { kind: "start" };
  if (status === 0xfb) return { kind: "continue" };
  if (status === 0xfc) return { kind: "stop" };

  const type = status & 0xf0;
  const channel = (status & 0x0f) + 1;
  if (type === 0x90) {
    const note = data[1] ?? 0;
    const velocity = data[2] ?? 0;
    if (velocity === 0) return { kind: "note_off", channel, note, velocity: 0 };
    return { kind: "note_on", channel, note, velocity };
  }
  if (type === 0x80) {
    return {
      kind: "note_off",
      channel,
      note: data[1] ?? 0,
      velocity: data[2] ?? 0,
    };
  }
  if (type === 0xb0) {
    return {
      kind: "cc",
      channel,
      controller: data[1] ?? 0,
      value: data[2] ?? 0,
    };
  }
  if (type === 0xe0) {
    const lsb = data[1] ?? 0;
    const msb = data[2] ?? 0;
    return { kind: "pitch_bend", channel, value: (msb << 7) | lsb };
  }
  return { kind: "unknown", status };
}

export type MidiBinding =
  | {
      id: string;
      type: "cc";
      channel?: number;
      controller: number;
      target: string;
      mode: "continuous";
    }
  | {
      id: string;
      type: "note";
      channel?: number;
      note: number;
      target: string;
      mode: "trigger" | "toggle" | "scene" | "cue";
    };

export type MidiLearnSession = {
  target: string;
  mode: MidiBinding["mode"] | "continuous";
  active: boolean;
};

export class MidiMapper {
  bindings: MidiBinding[] = [];
  learn: MidiLearnSession | null = null;
  private toggles = new Map<string, boolean>();

  startLearn(target: string, mode: MidiLearnSession["mode"] = "continuous"): void {
    this.learn = { target, mode, active: true };
  }

  cancelLearn(): void {
    this.learn = null;
  }

  /** Returns emitted control events from a MIDI message. */
  handle(
    msg: MidiMessage,
  ): Array<{ target: string; value: number; kind: string }> {
    const out: Array<{ target: string; value: number; kind: string }> = [];

    if (this.learn?.active) {
      if (msg.kind === "cc") {
        this.bindings = this.bindings.filter((b) => b.target !== this.learn!.target);
        this.bindings.push({
          id: `cc-${msg.channel}-${msg.controller}-${this.learn.target}`,
          type: "cc",
          channel: msg.channel,
          controller: msg.controller,
          target: this.learn.target,
          mode: "continuous",
        });
        this.learn = null;
        return out;
      }
      if (msg.kind === "note_on") {
        const mode =
          this.learn.mode === "continuous" ? "trigger" : this.learn.mode;
        this.bindings = this.bindings.filter((b) => b.target !== this.learn!.target);
        this.bindings.push({
          id: `note-${msg.channel}-${msg.note}-${this.learn.target}`,
          type: "note",
          channel: msg.channel,
          note: msg.note,
          target: this.learn.target,
          mode: mode as "trigger" | "toggle" | "scene" | "cue",
        });
        this.learn = null;
        return out;
      }
    }

    for (const b of this.bindings) {
      if (b.type === "cc" && msg.kind === "cc") {
        if (b.channel != null && b.channel !== msg.channel) continue;
        if (b.controller !== msg.controller) continue;
        out.push({ target: b.target, value: msg.value / 127, kind: "cc" });
      }
      if (b.type === "note" && msg.kind === "note_on") {
        if (b.channel != null && b.channel !== msg.channel) continue;
        if (b.note !== msg.note) continue;
        if (b.mode === "toggle") {
          const cur = !(this.toggles.get(b.target) ?? false);
          this.toggles.set(b.target, cur);
          out.push({ target: b.target, value: cur ? 1 : 0, kind: "toggle" });
        } else {
          out.push({
            target: b.target,
            value: msg.velocity / 127,
            kind: b.mode,
          });
        }
      }
    }
    return out;
  }

  toJSON(): MidiBinding[] {
    return [...this.bindings];
  }

  fromJSON(bindings: MidiBinding[]): void {
    this.bindings = [...bindings];
  }
}

/** Browser Web MIDI access wrapper (optional / permission-safe). */
export type MidiDeviceInfo = { id: string; name: string; manufacturer: string };

export class MidiInputManager {
  private access: MIDIAccess | null = null;
  private lastClockMs: number | null = null;
  onMessage: ((msg: MidiMessage, deviceId: string) => void) | null = null;
  onDevicesChanged: ((devices: MidiDeviceInfo[]) => void) | null = null;

  async init(): Promise<{ ok: boolean; error?: string }> {
    if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) {
      return { ok: false, error: "Web MIDI not available" };
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.access.onstatechange = () => this.emitDevices();
      this.wireInputs();
      this.emitDevices();
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  listDevices(): MidiDeviceInfo[] {
    if (!this.access) return [];
    const out: MidiDeviceInfo[] = [];
    this.access.inputs.forEach((input) => {
      out.push({
        id: input.id,
        name: input.name ?? "MIDI Input",
        manufacturer: input.manufacturer ?? "",
      });
    });
    return out;
  }

  private emitDevices(): void {
    this.onDevicesChanged?.(this.listDevices());
    this.wireInputs();
  }

  private wireInputs(): void {
    if (!this.access) return;
    this.access.inputs.forEach((input) => {
      input.onmidimessage = (ev) => {
        const data = ev.data;
        if (!data) return;
        const msg = parseMidiBytes(data);
        if (!msg) return;
        if (msg.kind === "clock") {
          const now = performance.now();
          this.lastClockMs = now;
        }
        this.onMessage?.(msg, input.id);
      };
    });
  }

  getLastClockMs(): number | null {
    return this.lastClockMs;
  }
}
