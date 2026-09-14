/** NAP v0 deterministic RNG: xoshiro128** with splitmix32 seed expansion. */

const MASK = 0xffffffff;

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

function splitmix32(state: { v: number }): number {
  state.v = (state.v + 0x9e3779b9) >>> 0;
  let z = state.v;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}

export function expandSeed(seed: number): [number, number, number, number] {
  const sm = { v: seed >>> 0 };
  let s0 = splitmix32(sm);
  let s1 = splitmix32(sm);
  let s2 = splitmix32(sm);
  let s3 = splitmix32(sm);
  if (s0 === 0 && s1 === 0 && s2 === 0 && s3 === 0) {
    s0 = 1;
  }
  return [s0, s1, s2, s3];
}

export class Rng {
  private s: [number, number, number, number];

  constructor(seed: number) {
    this.s = expandSeed(seed);
  }

  get state(): [number, number, number, number] {
    return [...this.s] as [number, number, number, number];
  }

  randomU32(): number {
    const s = this.s;
    const result = (Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] = (s[2] ^ s[0]) >>> 0;
    s[3] = (s[3] ^ s[1]) >>> 0;
    s[1] = (s[1] ^ s[2]) >>> 0;
    s[0] = (s[0] ^ s[3]) >>> 0;
    s[2] = (s[2] ^ t) >>> 0;
    s[3] = rotl(s[3], 11);
    return result;
  }

  /** Unit interval [0, 1) using top 24 bits. */
  randomF64(): number {
    return (this.randomU32() >>> 8) * (1.0 / 16777216.0);
  }
}
