/**
 * WASM loader for LatticefallSim (browser-first).
 * Fails loudly if WASM cannot initialize (no silent JS fallback).
 *
 * Node/Vitest: call `loadLatticefallWasmNode()` from tests instead.
 */

export type LatticefallSimApi = {
  free(): void;
  digest(): string;
  floats_per_particle(): number;
  particle_buffer(): Float32Array;
  particle_count(): number;
  set_params(params: Float32Array): void;
  step(
    dt: number,
    t: number,
    attractor_x: number,
    attractor_y: number,
    attractor_strength: number,
  ): void;
};

export type WasmModule = {
  LatticefallSim: new (
    seed: number,
    count: number,
    node_xy: Float32Array,
    params: Float32Array,
  ) => LatticefallSimApi;
  default: (input?: unknown) => Promise<unknown>;
  initSync?: (input: { module: BufferSource }) => unknown;
  rng_first_u32: (seed: number) => number;
};

let cached: WasmModule | null = null;

export async function loadLatticefallWasm(): Promise<WasmModule> {
  if (cached) return cached;
  try {
    const mod = (await import("../wasm/pkg/numbrane_wasm.js")) as unknown as WasmModule;
    await mod.default();
    cached = mod;
    return mod;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `LATTICEFALL WASM failed to initialize. Run: just latticefall-build\n${msg}`,
    );
  }
}

/** Flat ParticleParams layout expected by Rust. */
export function particleParamsFromWorld(world: {
  field: { strength: number; scale: number };
  particles: {
    speed: number;
    drag: number;
    life: number;
    lattice_attraction: number;
    escape_force: number;
  };
}): Float32Array {
  const p = world.particles;
  const f = world.field;
  const life = Math.max(0.5, p.life);
  return new Float32Array([
    f.strength * (0.5 + p.speed),
    p.lattice_attraction,
    0.35,
    p.drag * 4,
    life * 0.55,
    life * 1.25,
    0.04,
    1.0,
    1.2 + p.escape_force * 2.0,
    1.5 + f.scale * 2.0,
    0.12,
  ]);
}
