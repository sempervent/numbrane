/**
 * Presentation view-model for Set performance UI.
 */

import type { LiveSession } from "../../live/session";
import type { SetOrchestratorSnapshot } from "../../live/setOrchestrator";
import { resolveSetModel } from "../../live/setModel";
import type { SetDef, SetExecutionMode } from "../../live/types";

export type SetStatusView = {
  executionMode: SetExecutionMode | "idle";
  setName: string;
  setId: string;
  position: number;
  length: number;
  activeSceneId: string;
  activeSceneName: string;
  nextSceneId: string | null;
  nextSceneName: string | null;
  queuedSceneId: string | null;
  queuedSceneName: string | null;
  transitionFrom: string | null;
  transitionTo: string | null;
  transitionProgress: number;
  transitioning: boolean;
  dwellUntilBeat: number;
  currentBeat: number;
  autoAdvanceAtBeat: number | null;
  musicalTimingHealthy: boolean;
  transportSource: string;
  draftActive: boolean;
  phaseLabel: string;
};

function sceneName(set: SetDef | null, id: string | null): string | null {
  if (!set || !id) return null;
  try {
    const model = resolveSetModel(set);
    return model.scenes.find((s) => s.id === id)?.name ?? id;
  } catch {
    return id;
  }
}

export function buildSetStatusView(
  session: LiveSession | null,
  persistedSet: SetDef | null,
  executionMode: SetExecutionMode | "idle",
  draftActive: boolean,
): SetStatusView {
  const snap: SetOrchestratorSnapshot | null = session?.getSetOrchestratorSnapshot() ?? null;
  const transport = session?.runtime.transport.getSnapshot();
  const beat = transport?.beat ?? 0;
  const set = persistedSet;
  const model = set ? resolveSetModel(set) : null;
  const activeId = snap?.activeSceneId ?? model?.scenes[0]?.id ?? "";
  const activeIndex = snap?.activeIndex ?? 0;
  const tr = snap?.transition;
  const nextFromSequence =
    model && activeIndex >= 0 && activeIndex < model.scenes.length - 1
      ? model.scenes[activeIndex + 1]!.id
      : null;
  const queued = snap?.queuedSceneId ?? null;

  let phaseLabel = "ACTIVE";
  if (tr && tr.progress < 1) phaseLabel = "TRANSITIONING";
  else if (queued) phaseLabel = "QUEUED";
  else if (snap && beat < snap.dwellUntilBeat) phaseLabel = "DWELL";

  return {
    executionMode,
    setName: set?.name ?? "—",
    setId: set?.set_id ?? "",
    position: model ? activeIndex + 1 : 0,
    length: model?.scenes.length ?? 0,
    activeSceneId: activeId,
    activeSceneName: sceneName(set, activeId) ?? "—",
    nextSceneId: queued ?? nextFromSequence,
    nextSceneName: sceneName(set, queued ?? nextFromSequence),
    queuedSceneId: queued,
    queuedSceneName: sceneName(set, queued),
    transitionFrom: tr?.fromSceneId ?? null,
    transitionTo: tr?.toSceneId ?? null,
    transitionProgress: tr?.progress ?? 0,
    transitioning: Boolean(tr && tr.progress < 1),
    dwellUntilBeat: snap?.dwellUntilBeat ?? 0,
    currentBeat: beat,
    autoAdvanceAtBeat: snap?.autoAdvanceAtBeat ?? null,
    musicalTimingHealthy: snap?.musicalTiming ?? true,
    transportSource: transport?.source ?? "internal",
    draftActive,
    phaseLabel,
  };
}

export function edgeSummary(edge: import("../../live/types").SetEdgeDef | undefined): string {
  if (!edge) return "—";
  const adv =
    edge.advancement?.mode === "automatic"
      ? `AUTO · hold ${edge.advancement.dwell_bars} bars`
      : "MANUAL";
  const quant =
    edge.launch_quantization_bars && edge.launch_quantization_bars > 0
      ? ` · q ${edge.launch_quantization_bars} bar`
      : "";
  const morph = edge.morph;
  let morphStr = "morph ?";
  if (morph?.duration_bars) morphStr = `morph ${morph.duration_bars} bars`;
  else if (morph?.duration_beats) morphStr = `morph ${morph.duration_beats} beats`;
  else if (morph?.duration_seconds) morphStr = `morph ${morph.duration_seconds}s`;
  return `${adv}${quant} · ${morphStr}`;
}
