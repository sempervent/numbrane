/**
 * Resolve versioned SetDef into ordered scenes + outgoing edges.
 */

import type {
  AdvancementDef,
  SceneDef,
  SetDef,
  SetDefV1,
  SetDefV2,
  SetEdgeDef,
  TransitionDef,
} from "./types";

export type ResolvedSetModel = {
  setId: string;
  name: string;
  bpm?: number;
  defaultTransition?: TransitionDef;
  scenes: SceneDef[];
  /** edges[i]: transition from scenes[i] → scenes[i+1] */
  edges: SetEdgeDef[];
  cues: SetDef["cues"];
};

const DEFAULT_ADVANCE: AdvancementDef = { mode: "manual" };

function defaultMorph(
  set: SetDef,
  toScene: SceneDef,
): TransitionDef {
  return (
    toScene.transition ??
    set.default_transition ?? {
      type: "crossfade",
      duration_beats: 2,
    }
  );
}

function edgeFromLegacy(
  set: SetDefV1,
  from: SceneDef,
  to: SceneDef,
): SetEdgeDef {
  return {
    to_scene_id: to.id,
    advancement: DEFAULT_ADVANCE,
    launch_quantization_bars: 0,
    minimum_dwell_bars: 1,
    morph: defaultMorph(set, to),
    time_mode: "musical",
  };
}

/** Normalize 0.1.0 / partial 0.2.0 into a single runtime model. */
export function resolveSetModel(set: SetDef): ResolvedSetModel {
  if (set.protocol_version === "0.2.0") {
    const v2 = set as SetDefV2;
    const scenes: SceneDef[] = [];
    for (const id of v2.sequence) {
      const scene = v2.scene_catalog[id];
      if (!scene) throw new Error(`set missing scene_catalog entry: ${id}`);
      scenes.push(scene);
    }
    const edges: SetEdgeDef[] = [];
    for (let i = 0; i < scenes.length - 1; i++) {
      const from = scenes[i]!;
      const to = scenes[i + 1]!;
      const raw = v2.edges?.[i];
      edges.push({
        to_scene_id: to.id,
        advancement: raw?.advancement ?? DEFAULT_ADVANCE,
        launch_quantization_bars: raw?.launch_quantization_bars ?? 0,
        minimum_dwell_bars: raw?.minimum_dwell_bars ?? 1,
        morph: raw?.morph ?? defaultMorph(set, to),
        time_mode: raw?.time_mode ?? "musical",
      });
      if (raw && raw.to_scene_id !== to.id) {
        throw new Error(`edge[${i}] to_scene_id mismatch`);
      }
      void from;
    }
    return {
      setId: v2.set_id,
      name: v2.name,
      bpm: v2.bpm,
      defaultTransition: v2.default_transition,
      scenes,
      edges,
      cues: v2.cues,
    };
  }

  const v1 = set as SetDefV1;
  const scenes = v1.scenes;
  if (scenes.length === 0) throw new Error("set has no scenes");
  const edges: SetEdgeDef[] = [];
  for (let i = 0; i < scenes.length - 1; i++) {
    edges.push(edgeFromLegacy(v1, scenes[i]!, scenes[i + 1]!));
  }
  return {
    setId: v1.set_id,
    name: v1.name,
    bpm: v1.bpm,
    defaultTransition: v1.default_transition,
    scenes,
    edges,
    cues: v1.cues,
  };
}

/** Upgrade resolved model to persistable 0.2.0 (dedupe scenes by id). */
export function toSetDefV2(model: ResolvedSetModel): SetDefV2 {
  const catalog: Record<string, SceneDef> = {};
  for (const s of model.scenes) catalog[s.id] = s;
  return {
    protocol_version: "0.2.0",
    set_id: model.setId,
    name: model.name,
    bpm: model.bpm,
    default_transition: model.defaultTransition,
    scene_catalog: catalog,
    sequence: model.scenes.map((s) => s.id),
    edges: model.edges,
    cues: model.cues,
  };
}

/** Ephemeral single-scene set for piece prepare/load helpers. */
export function singleSceneSet(
  scene: SceneDef,
  meta: Partial<Pick<SetDefV1, "set_id" | "name" | "bpm" | "default_transition" | "cues">> = {},
): SetDefV1 {
  return {
    protocol_version: "0.1.0",
    set_id: meta.set_id ?? "ephemeral",
    name: meta.name ?? scene.name,
    scenes: [scene],
    bpm: meta.bpm,
    default_transition: meta.default_transition,
    cues: meta.cues,
  };
}

export function orderedScenes(set: SetDef): SceneDef[] {
  return resolveSetModel(set).scenes;
}

export function sceneIndex(model: ResolvedSetModel, sceneId: string): number {
  return model.scenes.findIndex((s) => s.id === sceneId);
}

export function nextSceneId(model: ResolvedSetModel, sceneId: string): string | null {
  const i = sceneIndex(model, sceneId);
  if (i < 0 || i >= model.scenes.length - 1) return null;
  return model.scenes[i + 1]!.id;
}

export function edgeAfter(model: ResolvedSetModel, sceneId: string): SetEdgeDef | null {
  const i = sceneIndex(model, sceneId);
  if (i < 0 || i >= model.edges.length) return null;
  return model.edges[i] ?? null;
}
