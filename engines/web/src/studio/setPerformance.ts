/**
 * Studio Set performance — persisted sets, rehearsal overlay, sparse perform surface.
 */

import type {
  RehearsalEntry,
  SceneDef,
  SetDef,
  SetDefV2,
  SetEdgeDef,
  SetExecutionMode,
} from "../live/types";
import { resolveSetModel, toSetDefV2 } from "../live/setModel";
import type { LiveSession } from "../live/session";

const STORAGE_KEY = "numbrane.studio.performanceSets.v1";

export type PersistedPerformanceSets = {
  version: 1;
  activeSetId: string | null;
  sets: Record<string, SetDef>;
  capturedScenes: SceneDef[];
};

export function loadPersistedSets(): PersistedPerformanceSets {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, activeSetId: null, sets: {}, capturedScenes: [] };
    const parsed = JSON.parse(raw) as PersistedPerformanceSets;
    if (parsed.version !== 1) return { version: 1, activeSetId: null, sets: {}, capturedScenes: [] };
    return parsed;
  } catch {
    return { version: 1, activeSetId: null, sets: {}, capturedScenes: [] };
  }
}

export function savePersistedSets(state: PersistedPerformanceSets): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function upsertSet(state: PersistedPerformanceSets, set: SetDef): PersistedPerformanceSets {
  const next = { ...state, sets: { ...state.sets, [set.set_id]: set } };
  savePersistedSets(next);
  return next;
}

export function addCapturedScene(state: PersistedPerformanceSets, scene: SceneDef): PersistedPerformanceSets {
  const next = {
    ...state,
    capturedScenes: [scene, ...state.capturedScenes].slice(0, 48),
  };
  savePersistedSets(next);
  return next;
}

export async function loadSetIntoSession(
  session: LiveSession,
  set: SetDef,
  mode: SetExecutionMode = "perform",
): Promise<void> {
  session.setSetExecutionMode(mode);
  await session.loadSet(set);
}

export async function rehearseFrom(
  session: LiveSession,
  set: SetDef,
  entry: RehearsalEntry,
): Promise<void> {
  session.setSetExecutionMode("rehearse");
  await session.loadSet(set);
  await session.seekRehearsal(entry);
}

/** Build a 0.2.0 set from ordered scene defs (authoring helper). */
export function buildOrderedSet(
  setId: string,
  name: string,
  scenes: SceneDef[],
  edges?: SetEdgeDef[],
): SetDefV2 {
  const model = resolveSetModel({
    protocol_version: "0.1.0",
    set_id: setId,
    name,
    scenes,
  });
  if (edges) {
    for (let i = 0; i < edges.length; i++) model.edges[i] = { ...model.edges[i]!, ...edges[i]! };
  }
  return toSetDefV2(model);
}
