/**
 * Ordered set performance — explicit queue / transition / dwell state machine.
 * UI and LiveSession delegate timing here; no React lifecycle authority.
 */

import { beatsFromTransition } from "./transport";
import {
  edgeAfter,
  nextSceneId,
  resolveSetModel,
  sceneIndex,
  toSetDefV2,
  type ResolvedSetModel,
} from "./setModel";
import type { RehearsalEntry, SetDef, SetExecutionMode, TransitionDef } from "./types";

export type OrchestratorTransition = {
  fromSceneId: string;
  toSceneId: string;
  /** 0..1 morph progress */
  progress: number;
  startBeat: number;
  durationBeats: number;
  morphType: string;
};

export type SetOrchestratorSnapshot = {
  activeSceneId: string;
  activeIndex: number;
  queuedSceneId: string | null;
  transition: OrchestratorTransition | null;
  dwellUntilBeat: number;
  autoAdvanceAtBeat: number | null;
  /** Scene id prepared for morph destination (never set while merely queued). */
  preparedDestinationId: string | null;
  /** After committed transition completes, start this morph (queue during transition). */
  pendingAfterDwellSceneId: string | null;
  musicalTiming: boolean;
  mode: SetExecutionMode;
};

export type OrchestratorTickInput = {
  beat: number;
  bpm: number;
  beatsPerBar: number;
  /** False when MIDI clock was expected but lost — use free-time morph durations. */
  musicalTimingHealthy: boolean;
  dtSec: number;
};

export type AdvanceResult =
  | { action: "none" }
  | { action: "queue"; destinationSceneId: string }
  | { action: "prepare_transition"; fromSceneId: string; toSceneId: string; transition: OrchestratorTransition }
  | { action: "complete_transition"; toSceneId: string };

function quantizeBeat(beat: number, bars: number, beatsPerBar: number): number {
  if (bars <= 0) return beat;
  const span = bars * beatsPerBar;
  return Math.ceil(beat / span) * span;
}

function morphDurationBeats(
  morph: TransitionDef,
  bpm: number,
  beatsPerBar: number,
  musical: boolean,
): number {
  if (!musical && morph.duration_seconds != null) {
    return beatsFromTransition({
      bpm,
      duration_seconds: morph.duration_seconds,
      beatsPerBar,
    });
  }
  return beatsFromTransition({
    bpm,
    duration_beats: morph.duration_beats,
    duration_bars: morph.duration_bars,
    duration_seconds: morph.duration_seconds,
    beatsPerBar,
  });
}

export class SetOrchestrator {
  private model: ResolvedSetModel | null = null;
  private activeSceneId = "";
  private queuedSceneId: string | null = null;
  private transition: OrchestratorTransition | null = null;
  private currentBeat = 0;
  private dwellUntilBeat = 0;
  private autoAdvanceAtBeat: number | null = null;
  private launchAtBeat: number | null = null;
  private pendingAfterDwellSceneId: string | null = null;
  private preparedDestinationId: string | null = null;
  private mode: SetExecutionMode = "perform";
  private musicalTiming = true;
  /** Draft overlay for rehearsal (does not replace persisted set until apply). */
  private rehearsalDraft: ResolvedSetModel | null = null;

  loadSet(set: SetDef, entry?: RehearsalEntry): void {
    this.model = resolveSetModel(set);
    this.rehearsalDraft = null;
    this.resetRuntimeState();
    if (entry) this.seekRehearsal(entry);
    else {
      this.activeSceneId = this.model.scenes[0]!.id;
      this.scheduleAutoAdvance(0);
    }
  }

  getModel(): ResolvedSetModel | null {
    return this.rehearsalDraft ?? this.model;
  }

  setExecutionMode(mode: SetExecutionMode): void {
    this.mode = mode;
  }

  getExecutionMode(): SetExecutionMode {
    return this.mode;
  }

  /** Rehearsal-only draft edits (non-destructive until applyRehearsalDraft). */
  setRehearsalDraft(set: SetDef | null): void {
    this.rehearsalDraft = set ? resolveSetModel(set) : null;
  }

  applyRehearsalDraft(): SetDef | null {
    if (!this.rehearsalDraft || !this.model) return null;
    const applied = toSetDefV2(this.rehearsalDraft);
    this.model = this.rehearsalDraft;
    this.rehearsalDraft = null;
    return applied;
  }

  snapshot(): SetOrchestratorSnapshot | null {
    const model = this.getModel();
    if (!model) return null;
    return {
      activeSceneId: this.activeSceneId,
      activeIndex: sceneIndex(model, this.activeSceneId),
      queuedSceneId: this.queuedSceneId,
      transition: this.transition ? { ...this.transition } : null,
      dwellUntilBeat: this.dwellUntilBeat,
      autoAdvanceAtBeat: this.autoAdvanceAtBeat,
      preparedDestinationId: this.preparedDestinationId,
      pendingAfterDwellSceneId: this.pendingAfterDwellSceneId,
      musicalTiming: this.musicalTiming,
      mode: this.mode,
    };
  }

  getActiveSceneId(): string {
    return this.activeSceneId;
  }

  getTransition(): OrchestratorTransition | null {
    return this.transition ? { ...this.transition } : null;
  }

  markDestinationPrepared(sceneId: string): void {
    if (this.transition?.toSceneId === sceneId) {
      this.preparedDestinationId = sceneId;
    }
  }

  /** Manual or automatic advance request. */
  requestAdvance(targetSceneId?: string): AdvanceResult {
    const model = this.getModel();
    if (!model) return { action: "none" };

    let dest = targetSceneId ?? null;
    if (!dest) {
      dest = this.queuedSceneId ?? nextSceneId(model, this.activeSceneId);
    }
    if (!dest || dest === this.activeSceneId) return { action: "none" };

    if (!this.transition && this.queuedSceneId && !targetSceneId) {
      dest = nextSceneId(model, this.activeSceneId) ?? dest;
    }

    if (!this.transition && this.queuedSceneId && targetSceneId) {
      this.queuedSceneId = dest;
      this.launchAtBeat = null;
      return { action: "queue", destinationSceneId: dest };
    }

    if (this.transition) {
      this.pendingAfterDwellSceneId = dest;
      this.queuedSceneId = null;
      return { action: "queue", destinationSceneId: dest };
    }

    if (this.currentBeat < this.dwellUntilBeat) {
      this.queuedSceneId = dest;
      return { action: "queue", destinationSceneId: dest };
    }

    const destIdx = sceneIndex(model, dest);
    const activeIdx = sceneIndex(model, this.activeSceneId);
    if (destIdx >= 0 && destIdx < activeIdx) {
      this.dwellUntilBeat = 0;
      this.queuedSceneId = null;
      this.pendingAfterDwellSceneId = null;
      const morph = model.defaultTransition ?? { type: "cut", duration_beats: 0 };
      return this.beginTransition(
        model,
        this.activeSceneId,
        dest,
        morphDurationBeats(morph, model.bpm ?? 120, 4, this.musicalTiming),
        morph.type ?? "cut",
        this.currentBeat,
      );
    }

    const edge = edgeAfter(model, this.activeSceneId);
    if (edge && edge.to_scene_id !== dest && sceneIndex(model, dest) >= 0) {
      this.queuedSceneId = dest;
      this.launchAtBeat = null;
      return { action: "queue", destinationSceneId: dest };
    }
    if (!edge || edge.to_scene_id !== dest) {
      const morph = model.defaultTransition ?? { type: "cut", duration_beats: 0 };
      return this.beginTransition(
        model,
        this.activeSceneId,
        dest,
        morphDurationBeats(morph, model.bpm ?? 120, 4, this.musicalTiming),
        morph.type ?? "cut",
        this.currentBeat,
      );
    }

    const quantBars = edge.launch_quantization_bars ?? 0;
    if (quantBars > 0) {
      this.queuedSceneId = dest;
      return { action: "queue", destinationSceneId: dest };
    }

    return this.beginTransition(
      model,
      this.activeSceneId,
      dest,
      morphDurationBeats(
        edge.morph ?? model.defaultTransition ?? { type: "crossfade", duration_beats: 2 },
        model.bpm ?? 120,
        4,
        this.musicalTiming,
      ),
      edge.morph?.type ?? "crossfade",
      this.currentBeat,
    );
  }

  /** Called each frame with transport snapshot. */
  tick(input: OrchestratorTickInput): AdvanceResult[] {
    const out: AdvanceResult[] = [];
    const model = this.getModel();
    if (!model) return out;

    this.musicalTiming = input.musicalTimingHealthy;
    this.currentBeat = input.beat;

    if (this.transition) {
      const tr = this.transition;
      if (tr.durationBeats <= 0) {
        tr.progress = 1;
      } else {
        tr.progress = Math.min(
          1,
          Math.max(0, (input.beat - tr.startBeat) / tr.durationBeats),
        );
      }
      if (tr.progress >= 1) {
        out.push(...this.completeTransition(model, input.beat));
      }
      return out;
    }

    // Dwell lock — no new morph launches until satisfied
    const dwellLocked = input.beat < this.dwellUntilBeat;

    if (!dwellLocked && this.queuedSceneId) {
      const dest = this.queuedSceneId;
      const edge = edgeAfter(model, this.activeSceneId);
      const quantBars = edge?.launch_quantization_bars ?? 0;
      if (this.launchAtBeat == null) {
        this.launchAtBeat =
          quantBars > 0 ? quantizeBeat(input.beat, quantBars, input.beatsPerBar) : input.beat;
      }
      if (input.beat >= (this.launchAtBeat ?? input.beat)) {
        this.queuedSceneId = null;
        this.launchAtBeat = null;
        out.push(this.beginTransitionTo(model, this.activeSceneId, dest, input, edge));
      }
    }

    if (dwellLocked) return out;

    if (this.pendingAfterDwellSceneId) {
      const dest = this.pendingAfterDwellSceneId;
      this.pendingAfterDwellSceneId = null;
      out.push(this.requestAdvance(dest));
      return out;
    }

    // Automatic advancement
    if (
      this.autoAdvanceAtBeat != null &&
      input.beat >= this.autoAdvanceAtBeat &&
      !this.queuedSceneId
    ) {
      const edge = edgeAfter(model, this.activeSceneId);
      if (edge?.advancement?.mode === "automatic") {
        this.autoAdvanceAtBeat = null;
        out.push(this.requestAdvance(edge.to_scene_id));
      }
    }

    return out;
  }

  setMusicalTimingHealthy(healthy: boolean): void {
    this.musicalTiming = healthy;
  }

  seekRehearsal(entry: RehearsalEntry): void {
    const model = this.getModel();
    if (!model) return;
    this.resetRuntimeState();

    if (entry.kind === "start") {
      this.activeSceneId = model.scenes[0]!.id;
      this.scheduleAutoAdvance(0);
      return;
    }

    if (entry.kind === "scene") {
      const idx = sceneIndex(model, entry.scene_id);
      if (idx >= 0) {
        this.activeSceneId = entry.scene_id;
        this.scheduleAutoAdvance(0);
      }
      return;
    }

    if (entry.kind === "before_transition") {
      const toIdx = sceneIndex(model, entry.to_scene_id);
      if (toIdx > 0) {
        this.activeSceneId = model.scenes[toIdx - 1]!.id;
        this.queuedSceneId = entry.to_scene_id;
        const edge = edgeAfter(model, this.activeSceneId);
        const quantBars = edge?.launch_quantization_bars ?? 0;
        if (quantBars > 0) {
          this.launchAtBeat = 0;
        }
      }
    }
  }

  private resetRuntimeState(): void {
    this.queuedSceneId = null;
    this.transition = null;
    this.dwellUntilBeat = 0;
    this.autoAdvanceAtBeat = null;
    this.launchAtBeat = null;
    this.pendingAfterDwellSceneId = null;
    this.preparedDestinationId = null;
  }

  private scheduleAutoAdvance(enteredAtBeat: number): void {
    const model = this.getModel();
    if (!model) return;
    const edge = edgeAfter(model, this.activeSceneId);
    if (edge?.advancement?.mode === "automatic") {
      const bpb = 4;
      this.autoAdvanceAtBeat = enteredAtBeat + edge.advancement.dwell_bars * bpb;
    } else {
      this.autoAdvanceAtBeat = null;
    }
  }

  private beginTransitionTo(
    model: ResolvedSetModel,
    fromId: string,
    toId: string,
    input: OrchestratorTickInput,
    edge: ReturnType<typeof edgeAfter>,
  ): AdvanceResult {
    const matched = edge?.to_scene_id === toId ? edge : null;
    const morph = matched?.morph ?? model.defaultTransition ?? { type: "crossfade", duration_beats: 2 };
    return this.beginTransition(
      model,
      fromId,
      toId,
      morphDurationBeats(morph, input.bpm, input.beatsPerBar, this.musicalTiming),
      morph.type ?? "crossfade",
      input.beat,
    );
  }

  private beginTransition(
    model: ResolvedSetModel,
    fromId: string,
    toId: string,
    durationBeats: number,
    morphType: string,
    startBeat: number,
  ): AdvanceResult {
    void model;
    this.transition = {
      fromSceneId: fromId,
      toSceneId: toId,
      progress: 0,
      startBeat,
      durationBeats: Math.max(0, durationBeats),
      morphType,
    };
    this.preparedDestinationId = null;
    this.queuedSceneId = null;
    this.launchAtBeat = null;
    return {
      action: "prepare_transition",
      fromSceneId: fromId,
      toSceneId: toId,
      transition: { ...this.transition },
    };
  }

  private completeTransition(model: ResolvedSetModel, beat: number): AdvanceResult[] {
    const toId = this.transition!.toSceneId;
    const toIdx = sceneIndex(model, toId);
    const arrivedEdge = toIdx > 0 ? model.edges[toIdx - 1] : null;
    const minDwellBars = arrivedEdge?.minimum_dwell_bars ?? 1;
    const bpb = 4;

    this.activeSceneId = toId;
    this.transition = null;
    this.preparedDestinationId = null;
    this.dwellUntilBeat = beat + minDwellBars * bpb;
    this.scheduleAutoAdvance(beat);

    const results: AdvanceResult[] = [{ action: "complete_transition", toSceneId: toId }];

    return results;
  }
}
