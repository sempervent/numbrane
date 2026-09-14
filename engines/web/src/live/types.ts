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

export type SetDef = {
  protocol_version: "0.1.0";
  set_id: string;
  name: string;
  bpm?: number;
  default_transition?: TransitionDef;
  scenes: SceneDef[];
  cues?: CueDef[];
};

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
