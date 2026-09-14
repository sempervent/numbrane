/**
 * NAP event record / replay for the web engine.
 * Types align with spec/schema/event.schema.json.
 * Mode changes are recorded as parameter.change with path "mode".
 */

export type PointerSpace = "normalized-screen" | "pixel" | "cartesian-2d";

export type NapEvent =
  | {
      type: "pointer.move" | "pointer.down" | "pointer.up";
      frame: number;
      tick?: number;
      pointer: {
        x: number;
        y: number;
        space?: PointerSpace;
        button?: number;
      };
    }
  | {
      type: "parameter.change";
      frame: number;
      tick?: number;
      parameter: { path: string; value: unknown };
    }
  | {
      type: "node.create";
      frame: number;
      tick?: number;
      node: { id?: string; x: number; y: number };
    }
  | {
      type: "node.delete";
      frame: number;
      tick?: number;
      node: { id?: string; x?: number; y?: number };
    }
  | {
      type: "transport.change";
      frame: number;
      tick?: number;
      transport: { playing?: boolean; bpm?: number };
    };

export type EventStream = {
  protocol_version: "0.1.0";
  seed: number;
  fps: number;
  events: NapEvent[];
};

function compareEvents(a: NapEvent, b: NapEvent): number {
  if (a.frame !== b.frame) return a.frame - b.frame;
  const at = a.tick ?? 0;
  const bt = b.tick ?? 0;
  return at - bt;
}

export class EventRecorder {
  private events: NapEvent[] = [];

  record(event: NapEvent): void {
    this.events.push(event);
  }

  /** Snapshot ordered by frame (then tick). */
  snapshot(): NapEvent[] {
    return [...this.events].sort(compareEvents);
  }

  clear(): void {
    this.events = [];
  }

  exportJSON(seed: number, fps: number): string {
    const stream: EventStream = {
      protocol_version: "0.1.0",
      seed: seed >>> 0,
      fps,
      events: this.snapshot(),
    };
    return JSON.stringify(stream, null, 2);
  }
}

export class EventReplayer {
  private readonly events: NapEvent[];
  private index = 0;

  constructor(events: NapEvent[]) {
    this.events = [...events].sort(compareEvents);
  }

  static fromJSON(raw: string): { stream: EventStream; replayer: EventReplayer } {
    const stream = JSON.parse(raw) as EventStream;
    if (!Array.isArray(stream.events)) {
      throw new Error("invalid event stream: missing events[]");
    }
    return { stream, replayer: new EventReplayer(stream.events) };
  }

  reset(): void {
    this.index = 0;
  }

  /** Events scheduled at exactly this frame (and optional tick window). */
  eventsAt(frame: number): NapEvent[] {
    const out: NapEvent[] = [];
    while (this.index < this.events.length && this.events[this.index].frame < frame) {
      this.index++;
    }
    while (this.index < this.events.length && this.events[this.index].frame === frame) {
      out.push(this.events[this.index]);
      this.index++;
    }
    return out;
  }

  /** All remaining events with frame <= targetFrame. */
  drainThrough(frame: number): NapEvent[] {
    const out: NapEvent[] = [];
    while (this.index < this.events.length && this.events[this.index].frame <= frame) {
      out.push(this.events[this.index]);
      this.index++;
    }
    return out;
  }

  get remaining(): number {
    return this.events.length - this.index;
  }
}

/** Helper: mode change as NAP parameter.change (path "mode"). */
export function modeChangeEvent(frame: number, mode: string): NapEvent {
  return {
    type: "parameter.change",
    frame,
    parameter: { path: "mode", value: mode },
  };
}
