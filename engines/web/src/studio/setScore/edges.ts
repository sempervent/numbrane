/**
 * Edge alignment when scene sequence changes.
 */

import { resolveSetModel } from "../../live/setModel";
import type { SceneDef, SetDefV2, SetEdgeDef } from "../../live/types";

function defaultEdge(toId: string): SetEdgeDef {
  return {
    to_scene_id: toId,
    advancement: { mode: "manual" },
    launch_quantization_bars: 0,
    minimum_dwell_bars: 1,
    morph: { type: "crossfade", duration_beats: 2 },
    time_mode: "musical",
  };
}

/** Map adjacent pairs to edge config for a sequence. */
export function edgeMapForSequence(
  sequence: string[],
  edges: SetEdgeDef[],
): Map<string, SetEdgeDef> {
  const out = new Map<string, SetEdgeDef>();
  for (let i = 0; i < sequence.length - 1; i++) {
    const from = sequence[i]!;
    const to = sequence[i + 1]!;
    const key = `${from}->${to}`;
    const edge = edges[i];
    if (edge && edge.to_scene_id === to) out.set(key, { ...edge });
  }
  return out;
}

export function rebuildEdges(
  sequence: string[],
  oldSequence: string[],
  oldEdges: SetEdgeDef[],
): SetEdgeDef[] {
  const oldMap = edgeMapForSequence(oldSequence, oldEdges);
  const edges: SetEdgeDef[] = [];
  for (let i = 0; i < sequence.length - 1; i++) {
    const from = sequence[i]!;
    const to = sequence[i + 1]!;
    const key = `${from}->${to}`;
    const edge = oldMap.get(key) ?? defaultEdge(to);
    edges.push({ ...edge, to_scene_id: to });
  }
  return edges;
}

export function moveSceneInSet(set: SetDefV2, fromIndex: number, toIndex: number): SetDefV2 {
  const sequence = [...set.sequence];
  if (fromIndex < 0 || fromIndex >= sequence.length) return set;
  if (toIndex < 0 || toIndex >= sequence.length) return set;
  if (fromIndex === toIndex) return set;
  const oldSequence = [...set.sequence];
  const [id] = sequence.splice(fromIndex, 1);
  sequence.splice(toIndex, 0, id!);
  const edges = rebuildEdges(sequence, oldSequence, set.edges ?? []);
  return { ...set, sequence, edges };
}

export function removeSceneFromSet(set: SetDefV2, index: number): SetDefV2 {
  if (index < 0 || index >= set.sequence.length) return set;
  const id = set.sequence[index]!;
  const oldSequence = [...set.sequence];
  const sequence = set.sequence.filter((_, i) => i !== index);
  const catalog = { ...set.scene_catalog };
  delete catalog[id];
  const edges = rebuildEdges(sequence, oldSequence, set.edges ?? []);
  return { ...set, sequence, scene_catalog: catalog, edges };
}

export function addSceneToSet(set: SetDefV2, scene: SceneDef): SetDefV2 {
  const oldSequence = [...set.sequence];
  const catalog = { ...set.scene_catalog, [scene.id]: scene };
  const sequence = [...set.sequence, scene.id];
  const edges = rebuildEdges(sequence, oldSequence, set.edges ?? []);
  return { ...set, scene_catalog: catalog, sequence, edges };
}

export function validateSetV2(set: SetDefV2): string[] {
  const errors: string[] = [];
  for (const id of set.sequence) {
    if (!set.scene_catalog[id]) errors.push(`Missing scene_catalog entry: ${id}`);
  }
  if (set.edges && set.edges.length !== Math.max(0, set.sequence.length - 1)) {
    errors.push(`Expected ${Math.max(0, set.sequence.length - 1)} edges, got ${set.edges.length}`);
  }
  for (let i = 0; i < (set.edges?.length ?? 0); i++) {
    const e = set.edges![i]!;
    const expectedTo = set.sequence[i + 1];
    if (expectedTo && e.to_scene_id !== expectedTo) {
      errors.push(`Edge ${i} to_scene_id must be ${expectedTo}`);
    }
  }
  try {
    resolveSetModel(set);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }
  return errors;
}
