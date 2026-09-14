/**
 * Modulation matrix, LFOs, and envelopes.
 */

import { Rng } from "../rng";

export type ModSourceId = string;

export type ModMapping = {
  id: string;
  source: ModSourceId;
  destination: string; // e.g. "layer.l0.chaos" or "post.exposure"
  amount: number;
  offset: number;
  min: number;
  max: number;
  curve: number; // 1 = linear; >1 expands highs
  invert: boolean;
  smoothing: number; // 0..1 toward previous
};

export type ModSources = Record<string, number>;

export function applyCurve(x: number, curve: number): number {
  const c = Math.max(0.1, curve);
  return Math.pow(Math.min(1, Math.max(0, x)), c);
}

export function mapModulation(
  source: number,
  m: ModMapping,
  prevEffective?: number,
): number {
  let s = Math.min(1, Math.max(0, source));
  if (m.invert) s = 1 - s;
  s = applyCurve(s, m.curve);
  const span = m.max - m.min;
  let v = m.min + (m.offset + s * m.amount) * span;
  v = Math.min(m.max, Math.max(m.min, v));
  if (prevEffective != null && m.smoothing > 0) {
    v = prevEffective + (v - prevEffective) * (1 - m.smoothing);
  }
  return v;
}

/** effective = base + (modulatedSpan - mid) style: base + amount*(source-0.5)*2*depth */
export function combineBaseAndMod(base: number, modValue: number, replace = false): number {
  if (replace) return modValue;
  return base + (modValue - 0.5) * 2 * Math.abs(modValue - 0.5 + 0.5);
}

/** Cleaner model: effective = lerp(base, mapped, depth) where mapped already in absolute units */
export function applyModToBase(base: number, mappedAbsolute: number, mix = 1): number {
  return base * (1 - mix) + mappedAbsolute * mix;
}

export class ModulationMatrix {
  mappings: ModMapping[] = [];
  private smooth = new Map<string, number>();

  setMappings(ms: ModMapping[]): void {
    this.mappings = [...ms];
  }

  /**
   * Returns destination → effective absolute value contributions.
   * Caller merges with bases.
   */
  evaluate(sources: ModSources): Record<string, number> {
    const out: Record<string, number> = {};
    for (const m of this.mappings) {
      const src = sources[m.source] ?? 0;
      const prev = this.smooth.get(m.id);
      const v = mapModulation(src, m, prev);
      this.smooth.set(m.id, v);
      out[m.destination] = v;
    }
    return out;
  }
}

export type LfoWave = "sine" | "triangle" | "saw" | "square" | "sample_hold" | "noise";

export type LfoDef = {
  id: string;
  wave: LfoWave;
  /** Rate in Hz unless sync is set. */
  rateHz?: number;
  /** Beats per cycle when sync="beats". */
  rateBeats?: number;
  /** Bars per cycle when sync="bars". */
  rateBars?: number;
  sync?: "hz" | "beats" | "bars";
  phase?: number;
  seed?: number;
};

export class LfoBank {
  private defs: LfoDef[] = [];
  private shHold = new Map<string, number>();
  private rngs = new Map<string, Rng>();

  setDefs(defs: LfoDef[]): void {
    this.defs = [...defs];
  }

  sample(beat: number, bpm: number, beatsPerBar = 4): Record<string, number> {
    const out: Record<string, number> = {};
    for (const d of this.defs) {
      const phase = this.phaseOf(d, beat, bpm, beatsPerBar);
      out[d.id] = this.wave(d, phase);
    }
    return out;
  }

  private phaseOf(d: LfoDef, beat: number, bpm: number, bpb: number): number {
    const sync = d.sync ?? (d.rateBeats != null ? "beats" : d.rateBars != null ? "bars" : "hz");
    let cycles = 0;
    if (sync === "beats") {
      const rb = Math.max(1e-6, d.rateBeats ?? 1);
      cycles = beat / rb;
    } else if (sync === "bars") {
      const rb = Math.max(1e-6, d.rateBars ?? 1);
      cycles = beat / (rb * bpb);
    } else {
      const hz = Math.max(1e-6, d.rateHz ?? 0.25);
      const t = (beat * 60) / Math.max(1e-6, bpm);
      cycles = t * hz;
    }
    return (cycles + (d.phase ?? 0)) % 1;
  }

  private wave(d: LfoDef, phase: number): number {
    const p = phase < 0 ? phase + 1 : phase;
    switch (d.wave) {
      case "sine":
        return 0.5 + 0.5 * Math.sin(p * Math.PI * 2);
      case "triangle":
        return p < 0.5 ? p * 2 : 2 - p * 2;
      case "saw":
        return p;
      case "square":
        return p < 0.5 ? 0 : 1;
      case "sample_hold": {
        const step = Math.floor(p * 16);
        const key = `${d.id}:${step}`;
        if (!this.shHold.has(key)) {
          const rng = this.rng(d);
          this.shHold.set(key, rng.randomF64());
        }
        return this.shHold.get(key)!;
      }
      case "noise": {
        const rng = this.rng(d);
        // reseeded each call would break determinism — use phase bucket
        const bucket = Math.floor(p * 64);
        const r = new Rng(((d.seed ?? 1) ^ Math.imul(bucket + 1, 0x9e3779b9)) >>> 0);
        return r.randomF64();
      }
      default:
        return 0.5;
    }
  }

  private rng(d: LfoDef): Rng {
    let r = this.rngs.get(d.id);
    if (!r) {
      r = new Rng((d.seed ?? 1) >>> 0);
      this.rngs.set(d.id, r);
    }
    return r;
  }
}

export type EnvelopeKind = "ad" | "adsr" | "pulse";

export type EnvelopeDef = {
  id: string;
  kind: EnvelopeKind;
  attack: number; // seconds
  decay: number;
  sustain?: number;
  release?: number;
};

export class EnvelopeBank {
  private defs = new Map<string, EnvelopeDef>();
  private active = new Map<
    string,
    { t0: number; stage: "a" | "d" | "s" | "r"; level: number; gate: boolean }
  >();

  setDefs(defs: EnvelopeDef[]): void {
    this.defs.clear();
    for (const d of defs) this.defs.set(d.id, d);
  }

  trigger(id: string, t: number): void {
    const d = this.defs.get(id);
    if (!d) return;
    this.active.set(id, { t0: t, stage: "a", level: 0, gate: true });
  }

  release(id: string): void {
    const a = this.active.get(id);
    if (a) {
      a.gate = false;
      a.stage = "r";
      a.t0 = a.t0; // keep; level continues
    }
  }

  /** Sample envelopes at logical time t (seconds). */
  sample(t: number): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, d] of this.defs) {
      const a = this.active.get(id);
      if (!a) {
        out[id] = 0;
        continue;
      }
      const elapsed = Math.max(0, t - a.t0);
      let level = 0;
      if (d.kind === "pulse") {
        level = elapsed < d.decay ? 1 - elapsed / Math.max(1e-6, d.decay) : 0;
      } else if (d.kind === "ad") {
        if (elapsed < d.attack) level = elapsed / Math.max(1e-6, d.attack);
        else {
          const ed = elapsed - d.attack;
          level = Math.max(0, 1 - ed / Math.max(1e-6, d.decay));
        }
      } else {
        // ADSR
        const sus = d.sustain ?? 0.7;
        const rel = d.release ?? d.decay;
        if (a.stage === "a") {
          level = elapsed / Math.max(1e-6, d.attack);
          if (level >= 1) {
            a.stage = "d";
            a.t0 = t;
            level = 1;
          }
        } else if (a.stage === "d") {
          const ed = t - a.t0;
          level = 1 - (1 - sus) * (ed / Math.max(1e-6, d.decay));
          if (ed >= d.decay) {
            a.stage = a.gate ? "s" : "r";
            a.t0 = t;
            level = sus;
          }
        } else if (a.stage === "s") {
          level = sus;
          if (!a.gate) {
            a.stage = "r";
            a.t0 = t;
          }
        } else {
          const er = t - a.t0;
          level = Math.max(0, sus * (1 - er / Math.max(1e-6, rel)));
        }
      }
      a.level = Math.min(1, Math.max(0, level));
      out[id] = a.level;
    }
    return out;
  }
}
