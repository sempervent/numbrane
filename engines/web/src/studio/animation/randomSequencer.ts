/**
 * Deterministic random animation method sequencer — separate from art seed.
 */

import type { AnimationMethod } from "./methods";
import { RANDOM_METHOD_ID } from "./methods";

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type RandomSequencerState = {
  methodId: string;
  methodElapsedSec: number;
  methodIntervalSec: number;
  methodIndex: number;
  sequenceSeed: number;
  allowedMethodIds: string[];
  history: string[];
};

export class RandomAnimationSequencer {
  private bag: string[] = [];
  private rng: () => number;

  constructor(
    public state: RandomSequencerState,
    private methods: AnimationMethod[],
  ) {
    this.rng = mulberry32(state.sequenceSeed);
    this.refillBag();
  }

  static create(
    sequenceSeed: number,
    intervalSec: number,
    allowedMethodIds: string[],
    methods: AnimationMethod[],
  ): RandomAnimationSequencer {
    return new RandomAnimationSequencer(
      {
        methodId: RANDOM_METHOD_ID,
        methodElapsedSec: 0,
        methodIntervalSec: intervalSec,
        methodIndex: 0,
        sequenceSeed,
        allowedMethodIds,
        history: [],
      },
      methods,
    );
  }

  private pool(): AnimationMethod[] {
    const allowed = new Set(this.state.allowedMethodIds);
    return this.methods.filter((m) => allowed.has(m.id));
  }

  private refillBag(): void {
    const pool = this.pool().map((m) => m.id);
    if (pool.length === 0) return;
    this.bag = [...pool];
    for (let i = this.bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [this.bag[i], this.bag[j]] = [this.bag[j]!, this.bag[i]!];
    }
    const last = this.state.history[this.state.history.length - 1];
    if (last && this.bag.length > 1 && this.bag[0] === last) {
      [this.bag[0], this.bag[1]] = [this.bag[1]!, this.bag[0]!];
    }
  }

  pickInitial(): string {
    const pool = this.pool();
    if (pool.length === 0) return "pan-left-right";
    if (!this.bag.length) this.refillBag();
    const id = this.bag.shift() ?? pool[0]!.id;
    this.state.history.push(id);
    this.state.methodIndex = 0;
    return id;
  }

  pickNext(): string {
    const pool = this.pool();
    if (pool.length === 0) return "pan-left-right";
    if (!this.bag.length) this.refillBag();
    let id = this.bag.shift() ?? pool[0]!.id;
    const last = this.state.history[this.state.history.length - 1];
    if (pool.length > 1 && id === last) {
      if (!this.bag.length) this.refillBag();
      id = this.bag.shift() ?? pool.find((m) => m.id !== last)?.id ?? id;
    }
    this.state.history.push(id);
    this.state.methodIndex += 1;
    this.state.methodElapsedSec = 0;
    return id;
  }

  tick(dt: number): string | null {
    if (dt <= 0) return null;
    this.state.methodElapsedSec += dt;
    if (this.state.methodElapsedSec < this.state.methodIntervalSec) return null;
    return this.pickNext();
  }

  forceNext(): string {
    return this.pickNext();
  }

  /** Deterministic method sequence for tests (no timing). */
  sequence(count: number): string[] {
    const seq: string[] = [];
    const s = RandomAnimationSequencer.create(
      this.state.sequenceSeed,
      this.state.methodIntervalSec,
      this.state.allowedMethodIds,
      this.methods,
    );
    seq.push(s.pickInitial());
    for (let i = 1; i < count; i++) seq.push(s.pickNext());
    return seq;
  }
}
