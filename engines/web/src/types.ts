/** Shared types for the audiovisual-nodes web piece. */
export type NodeFeature = {
  id: number;
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  size: number;
  hue: number; // 0..360
  vx: number;
  vy: number;
  life: number;
};

export type HarmonyMode = "major" | "minor" | "ambient" | "atonal";
export type VisualMode = "plasma" | "escape" | "rd" | "flow";

/** NAP logical animation clock. t = frame / fps. */
export type LogicalClock = {
  frame: number;
  fps: number;
  /** Logical seconds: frame / fps */
  t: number;
  /** Logical step: 1 / fps */
  dt: number;
};

export function makeClock(frame: number, fps: number): LogicalClock {
  const f = Math.max(0, Math.floor(frame));
  const rate = fps > 0 ? fps : 60;
  return { frame: f, fps: rate, t: f / rate, dt: 1 / rate };
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
