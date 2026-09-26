/** Scene / Set / Cue types for NUMBRANE LIVE. */

export type BlendMode =
  | "normal"
  | "add"
  | "multiply"
  | "screen"
  | "difference"
  | "lighten"
  | "darken";

export type TransitionType =
  | "cut"
  | "crossfade"
  | "fade-through-black"
  | "dissolve"
  | "wipe"
  | "voronoi-fracture";

export type TransitionDef = {
  type: TransitionType;
  duration_beats?: number;
  duration_bars?: number;
  duration_seconds?: number;
};

export type LayerTransform = {
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
};

export type LayerDef = {
  id: string;
  piece: string;
  opacity?: number;
  blend?: BlendMode;
  transform?: LayerTransform;
  parameters?: Record<string, number | string | boolean>;
  seed?: number;
};

export type PostDef = {
  exposure?: number;
  contrast?: number;
  saturation?: number;
  hue_shift?: number;
  vignette?: number;
  bloom?: number;
  feedback?: number;
  feedback_zoom?: number;
  feedback_rotation?: number;
  chromatic?: number;
  grain?: number;
};

export type ModulationDef = {
  id?: string;
  source: string;
  destination: string;
  amount?: number;
  offset?: number;
  min?: number;
  max?: number;
  curve?: number;
  invert?: boolean;
  smoothing?: number;
};

export type SceneDef = {
  id: string;
  name: string;
  layers: LayerDef[];
  post?: PostDef;
  modulation?: ModulationDef[];
  transition?: TransitionDef;
};

export type CueAction =
  | "next_scene"
  | "prev_scene"
  | "goto_scene"
  | "blackout"
  | "panic"
  | "reload"
  | "record_toggle";

export type CueDef = {
  id: string;
  action: CueAction;
  scene_id?: string;
  midi?: { type: "note" | "cc"; channel?: number; number: number };
};

export type AdvancementMode = "manual" | "automatic";

/** How the active scene advances along the ordered set. */
export type AdvancementDef =
  | { mode: "manual" }
  | { mode: "automatic"; dwell_bars: number };

/** Outgoing edge from scene[i] to scene[i+1] (0.2.0). */
export type SetEdgeDef = {
  to_scene_id: string;
  advancement?: AdvancementDef;
  /** Wait until next N-bar boundary before morph starts (0 = immediate). */
  launch_quantization_bars?: number;
  /** After arriving, hold this many bars before another morph may begin. */
  minimum_dwell_bars?: number;
  morph?: TransitionDef;
  time_mode?: "musical" | "free";
};

export type SetProtocolVersion = "0.1.0" | "0.2.0";

type SetDefBase = {
  set_id: string;
  name: string;
  bpm?: number;
  default_transition?: TransitionDef;
  cues?: CueDef[];
};

export type SetDefV1 = SetDefBase & {
  protocol_version: "0.1.0";
  scenes: SceneDef[];
};

export type SetDefV2 = SetDefBase & {
  protocol_version: "0.2.0";
  scene_catalog: Record<string, SceneDef>;
  sequence: string[];
  edges?: SetEdgeDef[];
};

/** Persisted live performance set (0.1 inline scenes or 0.2 catalog + sequence). */
export type SetDef = SetDefV1 | SetDefV2;

export type SetExecutionMode = "rehearse" | "perform";

/** Rehearsal entry — deterministic show positions. */
export type RehearsalEntry =
  | { kind: "start" }
  | { kind: "scene"; scene_id: string }
  | { kind: "before_transition"; to_scene_id: string };

export type QualityProfile = "low" | "medium" | "high" | "ultra";

export type ResolutionPreset =
  | "1920x1080"
  | "3840x2160"
  | "1080x1920"
  | "1080x1080";

export function parseResolution(preset: ResolutionPreset): { width: number; height: number } {
  const [w, h] = preset.split("x").map(Number);
  return { width: w ?? 1920, height: h ?? 1080 };
}
