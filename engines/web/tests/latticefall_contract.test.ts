/**
 * Cross-language LATTICEFALL contract: Python world streams + geometry
 * must agree with TypeScript/Rust seed derivation and node counts.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deriveStreams } from "../src/latticefall/seedStreams";
import { loadLatticefallWasmNode } from "../src/latticefall/wasmNode";
import { particleParamsFromWorld } from "../src/latticefall/wasm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const worldPath = resolve(root, "tests/fixtures/latticefall/world_seed42.json");

describe("latticefall cross-language contract", () => {
  it("TS streams match Python world fixture", () => {
    const world = JSON.parse(readFileSync(worldPath, "utf8")) as {
      seed: number;
      streams: Record<string, number>;
      geometry: { nodes: unknown[] };
      field: { summary: { mean_mag: number } };
      particles: { count: number };
    };
    expect(world.seed).toBe(42);
    const streams = deriveStreams(42);
    for (const [k, v] of Object.entries(world.streams)) {
      expect(streams[k], k).toBe(v);
    }
    expect(world.geometry.nodes.length).toBe(19);
    expect(world.field.summary.mean_mag).toBeGreaterThan(0);
  });

  it("WASM sim digests are stable for fixed seed", async () => {
    const world = JSON.parse(readFileSync(worldPath, "utf8")) as {
      seed: number;
      geometry: { nodes: Array<{ x: number; y: number }> };
      field: { strength: number; scale: number };
      particles: {
        count: number;
        speed: number;
        drag: number;
        life: number;
        lattice_attraction: number;
        escape_force: number;
      };
    };
    // Use smaller particle count for unit speed
    const small = {
      ...world,
      particles: { ...world.particles, count: 64 },
    };
    const mod = await loadLatticefallWasmNode();
    const nodeXy = new Float32Array(small.geometry.nodes.length * 2);
    small.geometry.nodes.forEach((n, i) => {
      nodeXy[i * 2] = n.x;
      nodeXy[i * 2 + 1] = n.y;
    });
    const params = particleParamsFromWorld(small);
    const sim = new mod.LatticefallSim(42, 64, nodeXy, params);
    for (let i = 0; i < 60; i++) sim.step(1 / 60, i / 60, 0, 0, 0);
    const d1 = sim.digest();
    sim.free();

    const sim2 = new mod.LatticefallSim(42, 64, nodeXy, params);
    for (let i = 0; i < 60; i++) sim2.step(1 / 60, i / 60, 0, 0, 0);
    expect(sim2.digest()).toBe(d1);
    sim2.free();
  });
});
