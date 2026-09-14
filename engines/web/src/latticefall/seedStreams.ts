/**
 * Named deterministic RNG substreams — must match Python/Rust.
 *
 * Algorithm:
 * 1. FNV-1a 32 over UTF-8 stream name
 * 2. state = (seed ^ h) & 0xffffffff
 * 3. one splitmix32 step → stream seed
 */

const MASK = 0xffff_ffff;
const FNV_OFFSET = 0x811c_9dc5;
const FNV_PRIME = 0x0100_0193;

export const STREAM_NAMES = [
  "geometry",
  "field",
  "particles",
  "fractal",
  "palette",
  "audio",
  "interaction",
] as const;

export type StreamName = (typeof STREAM_NAMES)[number];

function splitmix32(state: number): number {
  let z = (state + 0x9e37_79b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85eb_ca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2_ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}

export function fnv1a32(data: Uint8Array | string): number {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  let h = FNV_OFFSET;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

export function streamSeed(seed: number, name: string): number {
  const h = fnv1a32(name);
  const state = ((seed >>> 0) ^ h) >>> 0;
  return splitmix32(state);
}

export function deriveStreams(
  seed: number,
  names: readonly string[] = STREAM_NAMES,
): Record<string, number> {
  const s = seed >>> 0;
  const out: Record<string, number> = {};
  for (const name of names) {
    out[name] = streamSeed(s, name);
  }
  return out;
}
