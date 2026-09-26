/**
 * Continuous scene morph — layer birth/death, params, post, transforms.
 */

import type { LayerDef, PostDef, SceneDef } from "./types";

export type MorphLayerState = {
  id: string;
  piece: string;
  opacity: number;
  blend: LayerDef["blend"];
  transform?: LayerDef["transform"];
  parameters: Record<string, number | string | boolean>;
  seed?: number;
  /** 1 = fully contributing, 0 = absent */
  presence: number;
};

export type MorphedScene = {
  layers: MorphLayerState[];
  post: PostDef;
  progress: number;
};

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPost(a: PostDef, b: PostDef, t: number): PostDef {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof PostDef>;
  const out: PostDef = {};
  for (const k of keys) {
    const va = a[k] ?? 0;
    const vb = b[k] ?? 0;
    out[k] = lerp(va, vb, t);
  }
  return out;
}

function lerpParams(
  a: Record<string, number | string | boolean>,
  b: Record<string, number | string | boolean>,
  t: number,
): Record<string, number | string | boolean> {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: Record<string, number | string | boolean> = {};
  for (const k of keys) {
    const va = a[k];
    const vb = b[k];
    if (typeof va === "number" && typeof vb === "number") {
      out[k] = lerp(va, vb, t);
    } else if (va !== undefined && vb === undefined) {
      out[k] = va;
    } else if (vb !== undefined) {
      out[k] = vb;
    }
  }
  return out;
}

function layerMap(scene: SceneDef): Map<string, LayerDef> {
  return new Map(scene.layers.map((l) => [l.id, l]));
}

/** Morph between two scene definitions at progress p ∈ [0,1]. Both sides keep simulating externally. */
export function morphScenes(from: SceneDef, to: SceneDef, progress: number): MorphedScene {
  const p = smoothstep(progress);
  const fromMap = layerMap(from);
  const toMap = layerMap(to);
  const ids = new Set([...fromMap.keys(), ...toMap.keys()]);
  const layers: MorphLayerState[] = [];

  for (const id of ids) {
    const a = fromMap.get(id);
    const b = toMap.get(id);
    if (a && b) {
      layers.push({
        id,
        piece: p < 0.5 ? a.piece : b.piece,
        opacity: lerp(a.opacity ?? 1, b.opacity ?? 1, p),
        blend: p < 0.5 ? (a.blend ?? "normal") : (b.blend ?? "normal"),
        transform: p < 0.5 ? a.transform : b.transform,
        parameters: lerpParams(a.parameters ?? {}, b.parameters ?? {}, p),
        seed: p < 0.5 ? a.seed : b.seed,
        presence: 1,
      });
    } else if (a && !b) {
      layers.push({
        id,
        piece: a.piece,
        opacity: (a.opacity ?? 1) * (1 - p),
        blend: a.blend ?? "normal",
        transform: a.transform,
        parameters: { ...(a.parameters ?? {}) },
        seed: a.seed,
        presence: 1 - p,
      });
    } else if (b && !a) {
      layers.push({
        id,
        piece: b.piece,
        opacity: (b.opacity ?? 1) * p,
        blend: b.blend ?? "normal",
        transform: b.transform,
        parameters: { ...(b.parameters ?? {}) },
        seed: b.seed,
        presence: p,
      });
    }
  }

  return {
    layers,
    post: lerpPost(from.post ?? {}, to.post ?? {}, p),
    progress: p,
  };
}

/** Flatten morphed layers into a synthetic SceneDef for capture / persistence. */
export function morphedSceneToDef(
  name: string,
  id: string,
  morphed: MorphedScene,
  sourceModulation: SceneDef["modulation"],
): SceneDef {
  const layers: LayerDef[] = morphed.layers
    .filter((l) => l.presence > 0.02)
    .map((l) => ({
      id: l.id,
      piece: l.piece,
      opacity: l.opacity * l.presence,
      blend: l.blend ?? "normal",
      transform: l.transform,
      parameters: { ...l.parameters },
      seed: l.seed,
    }));
  return {
    id,
    name,
    layers,
    post: { ...morphed.post },
    modulation: sourceModulation ? [...sourceModulation] : [],
  };
}
