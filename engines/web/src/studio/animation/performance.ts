/**
 * Live performance surface — unbounded PerformanceClock vs finite ExportTimeline.
 */

import { rendererKindFor, studioSurface } from "../runtime/surface";
import type { StudioMode } from "../keyboard/registry";
import { hasComponent, type AnimationSpec } from "./spec";
import { normalizeSpecForPiece } from "./capabilities";
import {
  applyAnimationMethod,
  animationMethodsForPiece,
  defaultAnimationMethodId,
  RANDOM_METHOD_ID,
} from "./methods";

export type PerformanceTransition = "cut" | "crossfade" | "fade-black";

/** Any piece that animates on the browser live surface (not python-api preview). */
function isLiveNativeBackend(pieceId: string, mode: StudioMode = "animate"): boolean {
  return studioSurface(pieceId, mode) === "live";
}

/** Normalize animation spec for indefinite browser-live performance. */
export function normalizeSpecForLivePerformance(
  pieceId: string,
  spec: AnimationSpec,
  mode: StudioMode = "animate",
): AnimationSpec {
  const out = normalizeSpecForPiece(pieceId, { ...spec, camera: { ...spec.camera } });
  if (mode !== "animate" && mode !== "react") return out;

  const liveNative = isLiveNativeBackend(pieceId, mode);

  // Camera-only on live native must composite with generative — never freeze empty snapshot.
  if (
    liveNative &&
    hasComponent(out, "camera") &&
    !hasComponent(out, "generative") &&
    !hasComponent(out, "construction")
  ) {
    out.source = "composite";
    out.components = ["generative", "camera"];
    out.endBehavior = "continuous";
    if (out.durationSec <= 0) out.durationSec = out.motion === "drift" ? 16 : 8;
    return out;
  }

  // Native generative sim: unbounded performance clock
  if (liveNative && hasComponent(out, "generative")) {
    out.endBehavior = "continuous";
    out.durationSec = 0;
    return out;
  }

  // Api-preview / construction: keep continuous for performance unless method needs loop
  if (out.endBehavior === "hold" || out.endBehavior === "stop") {
    out.endBehavior = "continuous";
  }
  return out;
}

/** Default live Animate method for a compositor layer (underlying piece, not mashup id). */
export function defaultLayerLiveMethodId(pieceId: string): string {
  const methods = animationMethodsForPiece(pieceId);
  const continuousGen = methods.find(
    (m) =>
      m.category === "native" &&
      m.source === "generative" &&
      m.defaultEndBehavior === "continuous",
  );
  if (continuousGen) return continuousGen.id;
  const construction = methods.find((m) => m.source === "construction");
  if (construction) return construction.id;
  const native = methods.find((m) => m.category === "native");
  if (native) return native.id;
  return defaultAnimationMethodId(pieceId);
}

export function resolveLivePerformanceMethodSpec(
  pieceId: string,
  methodId: string,
  mode: StudioMode = "animate",
): AnimationSpec {
  if (methodId === RANDOM_METHOD_ID) {
    return normalizeSpecForLivePerformance(
      pieceId,
      applyAnimationMethod(pieceId, "slow-drift"),
      mode,
    );
  }
  return normalizeSpecForLivePerformance(pieceId, applyAnimationMethod(pieceId, methodId), mode);
}

/** Export timeline — finite duration for file export only. */
export function specForExport(base: AnimationSpec, durationSec: number, fps: number): AnimationSpec {
  return {
    ...base,
    durationSec: Math.max(0.5, durationSec),
    endBehavior: base.endBehavior === "continuous" ? "loop" : base.endBehavior,
  };
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic piece rotation for performance auto-switch. */
export class VisualSwitchSequencer {
  private bag: string[] = [];
  private elapsedSec = 0;
  private lastId = "";
  private readonly rng: () => number;

  constructor(
    private readonly pool: string[],
    private readonly sequenceSeed: number,
    public intervalSec: number,
  ) {
    this.rng = mulberry32(sequenceSeed);
    this.refill();
  }

  private refill(): void {
    this.bag = [...this.pool];
    for (let i = this.bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [this.bag[i], this.bag[j]] = [this.bag[j]!, this.bag[i]!];
    }
    if (this.lastId && this.bag.length > 1 && this.bag[0] === this.lastId) {
      [this.bag[0], this.bag[1]] = [this.bag[1]!, this.bag[0]!];
    }
  }

  pickNext(currentId: string): string {
    const candidates = this.pool.filter((id) => id !== currentId);
    if (candidates.length === 0) return currentId;
    if (!this.bag.length) this.refill();
    let next = this.bag.shift() ?? candidates[0]!;
    if (candidates.length > 1 && next === currentId) {
      next = candidates[Math.floor(this.rng() * candidates.length)]!;
    }
    this.lastId = next;
    this.elapsedSec = 0;
    return next;
  }

  tick(dt: number, currentId: string): string | null {
    if (dt <= 0 || this.pool.length < 2) return null;
    this.elapsedSec += dt;
    if (this.elapsedSec < this.intervalSec) return null;
    return this.pickNext(currentId);
  }
}
