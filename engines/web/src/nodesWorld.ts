/** Deterministic audiovisual node world (NAP Rng + logical dt). */
import type { NapEvent } from "./events";
import { Rng } from "./rng";
import type { HarmonyMode, NodeFeature, VisualMode } from "./types";

export type WorldParams = {
  bpm: number;
  complexity: number;
  mutation: number;
  chaos: number;
  palette: number;
  harmony: HarmonyMode;
  mode: VisualMode;
  exposure: number;
  playing: boolean;
};

const DEFAULT_PARAMS: WorldParams = {
  bpm: 90,
  complexity: 24,
  mutation: 0.2,
  chaos: 0.35,
  palette: 200,
  harmony: "ambient",
  mode: "plasma",
  exposure: 1.2,
  playing: false,
};

export class NodesWorld {
  seed: number;
  params: WorldParams;
  nodes: NodeFeature[] = [];
  private rng: Rng;
  private idCounter = 0;

  constructor(seed: number, params: Partial<WorldParams> = {}) {
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed);
    this.params = { ...DEFAULT_PARAMS, ...params };
  }

  /** Reset RNG and nodes from seed (params preserved unless overridden). */
  reset(seed?: number, params?: Partial<WorldParams>): void {
    if (seed !== undefined) this.seed = seed >>> 0;
    if (params) this.params = { ...this.params, ...params };
    this.rng = new Rng(this.seed);
    this.nodes = [];
    this.idCounter = 0;
  }

  private random(): number {
    return this.rng.randomF64();
  }

  addNode(x: number, y: number): NodeFeature {
    const node: NodeFeature = {
      id: ++this.idCounter,
      x,
      y,
      size: 0.02 + this.random() * 0.06,
      hue: (this.params.palette + this.random() * 60) % 360,
      vx: (this.random() - 0.5) * 0.1,
      vy: (this.random() - 0.5) * 0.1,
      life: 1.0,
    };
    this.nodes = this.nodes.concat(node);
    return node;
  }

  removeNearest(x: number, y: number): void {
    if (this.nodes.length === 0) return;
    let best = 0;
    let dmin = Infinity;
    this.nodes.forEach((n, i) => {
      const dx = n.x - x;
      const dy = n.y - y;
      const d = dx * dx + dy * dy;
      if (d < dmin) {
        dmin = d;
        best = i;
      }
    });
    const nodes = this.nodes.slice();
    nodes.splice(best, 1);
    this.nodes = nodes;
  }

  removeById(id: number): void {
    this.nodes = this.nodes.filter((n) => n.id !== id);
  }

  /** Advance node mutations by logical dt (seconds). */
  tickMutations(dt: number): void {
    const { mutation, chaos } = this.params;
    this.nodes = this.nodes.map((n) => {
      const jitter = (this.random() - 0.5) * mutation * dt * (0.2 + chaos);
      const vx = n.vx + jitter;
      const vy = n.vy + jitter;
      let x = n.x + vx * dt;
      let y = n.y + vy * dt;
      x = ((x % 1) + 1) % 1;
      y = ((y % 1) + 1) % 1;
      const hue = (n.hue + mutation * 120 * dt) % 360;
      const size = Math.max(0.005, Math.min(0.12, n.size + jitter * 0.5));
      const life = Math.max(0, n.life - 0.005 * dt);
      return { ...n, x, y, vx, vy, hue, size, life };
    });
  }

  applyEvent(event: NapEvent): void {
    switch (event.type) {
      case "node.create":
        this.addNode(event.node.x, event.node.y);
        break;
      case "node.delete":
        if (event.node.id !== undefined) {
          const id = Number(event.node.id);
          if (!Number.isNaN(id)) this.removeById(id);
        } else if (event.node.x !== undefined && event.node.y !== undefined) {
          this.removeNearest(event.node.x, event.node.y);
        }
        break;
      case "parameter.change": {
        const path = event.parameter.path;
        const value = event.parameter.value;
        if (path === "mode" && typeof value === "string") {
          this.params.mode = value as VisualMode;
        } else if (path === "bpm" && typeof value === "number") {
          this.params.bpm = value;
        } else if (path === "complexity" && typeof value === "number") {
          this.params.complexity = value;
        } else if (path === "mutation" && typeof value === "number") {
          this.params.mutation = value;
        } else if (path === "chaos" && typeof value === "number") {
          this.params.chaos = value;
        } else if (path === "palette" && typeof value === "number") {
          this.params.palette = value;
        } else if (path === "exposure" && typeof value === "number") {
          this.params.exposure = value;
        } else if (path === "harmony" && typeof value === "string") {
          this.params.harmony = value as HarmonyMode;
        }
        break;
      }
      case "transport.change":
        if (event.transport.bpm !== undefined) this.params.bpm = event.transport.bpm;
        if (event.transport.playing !== undefined) this.params.playing = event.transport.playing;
        break;
      case "pointer.down":
      case "pointer.up":
      case "pointer.move":
        // Pointer geometry is applied by the live driver (seed/node); replay uses node.* events.
        break;
      default:
        break;
    }
  }

  /**
   * Replay events from frame 0..endFrame inclusive.
   * At each frame: apply events scheduled for that frame, then tickMutations(dt).
   */
  runReplay(events: NapEvent[], endFrame: number, fps: number): NodeFeature[] {
    this.reset(this.seed);
    const rate = fps > 0 ? fps : 60;
    const dt = 1 / rate;
    const sorted = [...events].sort((a, b) => {
      if (a.frame !== b.frame) return a.frame - b.frame;
      return (a.tick ?? 0) - (b.tick ?? 0);
    });
    let ei = 0;
    for (let frame = 0; frame <= endFrame; frame++) {
      while (ei < sorted.length && sorted[ei].frame === frame) {
        this.applyEvent(sorted[ei]);
        ei++;
      }
      this.tickMutations(dt);
    }
    return this.nodes.map((n) => ({ ...n }));
  }
}
