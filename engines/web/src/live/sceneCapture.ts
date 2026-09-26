/**
 * Capture reproducible scene state from an in-progress morph or active scene.
 */

import { morphScenes, morphedSceneToDef } from "./sceneMorph";
import type { SceneDef } from "./types";

export type CaptureContext = {
  fromScene: SceneDef;
  toScene: SceneDef | null;
  morphProgress: number | null;
  performanceTimeSec: number;
  globalSeed: number;
};

/** Deterministic entry when seeking rehearsal mid-set (documented limitation). */
export function rehearsalEntryPerformanceTimeSec(
  sceneIndex: number,
  globalSeed: number,
): number {
  return sceneIndex * 8 + (globalSeed % 1000) * 0.001;
}

export function captureSceneCandidate(ctx: CaptureContext, id: string, name: string): SceneDef {
  if (ctx.toScene && ctx.morphProgress != null && ctx.morphProgress > 0 && ctx.morphProgress < 1) {
    const morphed = morphScenes(ctx.fromScene, ctx.toScene, ctx.morphProgress);
    const def = morphedSceneToDef(name, id, morphed, ctx.fromScene.modulation);
    def.layers.forEach((layer) => {
      if (layer.seed == null) layer.seed = ctx.globalSeed;
      layer.parameters = {
        ...layer.parameters,
        "capture.performanceTimeSec": ctx.performanceTimeSec,
      };
    });
    return def;
  }
  const base = ctx.toScene ?? ctx.fromScene;
  return {
    ...base,
    id,
    name,
    layers: base.layers.map((l) => ({
      ...l,
      parameters: {
        ...(l.parameters ?? {}),
        "capture.performanceTimeSec": ctx.performanceTimeSec,
      },
    })),
  };
}
