/** Live Zustand store wrapping NodesWorld (NAP-deterministic). */
import { create } from "zustand";
import { NodesWorld, type WorldParams } from "./nodesWorld";
import type { HarmonyMode, NodeFeature, VisualMode } from "./types";

type Store = WorldParams & {
  seed: number;
  nodes: NodeFeature[];
  /** Frame advanced by the live driver (logical clock). */
  frame: number;
  fps: number;
  setSeed: (seed: number) => void;
  addNode: (x: number, y: number) => void;
  removeNearest: (x: number, y: number) => void;
  tickMutations: (dt: number) => void;
  setFrame: (frame: number) => void;
  setParam: <K extends keyof WorldParams>(k: K, v: WorldParams[K]) => void;
  /** Replace world from recipe seed + optional params. */
  hydrateFromRecipe: (seed: number, params?: Partial<WorldParams>) => void;
  /** Snapshot node list (for tests / export). */
  getNodes: () => NodeFeature[];
};

const DEFAULT_SEED = 42;
let world = new NodesWorld(DEFAULT_SEED);

function syncNodes(set: (partial: Partial<Store>) => void): void {
  set({ nodes: world.nodes.map((n) => ({ ...n })) });
}

export const useStore = create<Store>((set, get) => ({
  seed: DEFAULT_SEED,
  frame: 0,
  fps: 60,
  bpm: 90,
  complexity: 24,
  mutation: 0.2,
  chaos: 0.35,
  palette: 200,
  harmony: "ambient" as HarmonyMode,
  mode: "plasma" as VisualMode,
  exposure: 1.2,
  playing: false,
  nodes: [],
  setSeed: (seed) => {
    world.reset(seed >>> 0);
    set({
      seed: seed >>> 0,
      nodes: [],
      frame: 0,
      bpm: world.params.bpm,
      complexity: world.params.complexity,
      mutation: world.params.mutation,
      chaos: world.params.chaos,
      palette: world.params.palette,
      harmony: world.params.harmony,
      mode: world.params.mode,
      exposure: world.params.exposure,
      playing: world.params.playing,
    });
  },
  hydrateFromRecipe: (seed, params) => {
    world = new NodesWorld(seed >>> 0, params);
    set({
      seed: seed >>> 0,
      nodes: [],
      frame: 0,
      bpm: world.params.bpm,
      complexity: world.params.complexity,
      mutation: world.params.mutation,
      chaos: world.params.chaos,
      palette: world.params.palette,
      harmony: world.params.harmony,
      mode: world.params.mode,
      exposure: world.params.exposure,
      playing: world.params.playing,
      fps: get().fps,
    });
  },
  addNode: (x, y) => {
    world.addNode(x, y);
    syncNodes(set);
  },
  removeNearest: (x, y) => {
    world.removeNearest(x, y);
    syncNodes(set);
  },
  tickMutations: (dt) => {
    world.params.mutation = get().mutation;
    world.params.chaos = get().chaos;
    world.tickMutations(dt);
    syncNodes(set);
  },
  setFrame: (frame) => set({ frame }),
  setParam: (k, v) => {
    (world.params as WorldParams)[k] = v;
    set({ [k]: v } as Partial<Store>);
  },
  getNodes: () => world.nodes.map((n) => ({ ...n })),
}));

/** Access the underlying world (tests / replay). */
export function getWorld(): NodesWorld {
  return world;
}

export function replaceWorld(next: NodesWorld): void {
  world = next;
}
