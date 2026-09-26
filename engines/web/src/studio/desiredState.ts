/**
 * Authoritative Studio configuration snapshot — all scene loads commit against this shape.
 */

import type { SetDef } from "../live/types";
import type { StudioMode } from "./keyboard/registry";
import type { ColorConfig } from "./color/model";
import type { AnimationSpec } from "./animation/spec";
import {
  RANDOM_METHOD_ID,
  animationMethodsForPiece,
  defaultAnimationMethodId,
  getAnimationMethod,
} from "./animation/methods";
import { compositionById } from "./compositions";
import { buildMashupSet } from "./mashups";
import { defaultMappingsForPiece } from "./audio/mappings";
import type { ReactSensitivity } from "./audio/profiles";
import { paramsForApi } from "./runtime/surface";

export type StudioDesiredState = {
  mode: StudioMode;
  pieceId: string;
  seed: number;
  compositionId: string | null;
  params: Record<string, number | string | boolean>;
  color: ColorConfig;
  animationMethodId: string;
  activeAnimationMethodId: string;
  playing: boolean;
  reactSensitivity: ReactSensitivity;
};

export function normalizeAnimationMethodForPiece(
  pieceId: string,
  animationMethodId: string,
  activeAnimationMethodId: string,
): { animationMethodId: string; activeAnimationMethodId: string } {
  if (animationMethodId === RANDOM_METHOD_ID) {
    const allowed = animationMethodsForPiece(pieceId).map((m) => m.id);
    const active = allowed.includes(activeAnimationMethodId)
      ? activeAnimationMethodId
      : defaultAnimationMethodId(pieceId);
    return { animationMethodId: RANDOM_METHOD_ID, activeAnimationMethodId: active };
  }
  const method = getAnimationMethod(pieceId, animationMethodId);
  if (method) {
    return { animationMethodId, activeAnimationMethodId: animationMethodId };
  }
  const fallback = defaultAnimationMethodId(pieceId);
  return { animationMethodId: fallback, activeAnimationMethodId: fallback };
}

export function buildStudioSetDef(desired: StudioDesiredState): SetDef {
  const mappings =
    desired.mode === "react"
      ? defaultMappingsForPiece(desired.pieceId, desired.reactSensitivity).map((m, i) => ({
          id: `studio-${i}`,
          source: m.source.startsWith("audio.") ? m.source : `audio.${m.source}`,
          destination: `layer.L0.${m.target}`,
          amount: m.amount,
          min: 0,
          max: 2,
        }))
      : [];
  const composition = desired.compositionId ? compositionById(desired.compositionId) : undefined;
  const apiParams = paramsForApi(desired.params, desired.color);
  const mashupSet = buildMashupSet(desired.pieceId, desired.seed, apiParams);
  const set: SetDef = composition
    ? composition.build(desired.seed, desired.params)
    : mashupSet ?? {
        protocol_version: "0.1.0",
        set_id: "studio-session",
        name: "Studio",
        scenes: [
          {
            id: "main",
            name: desired.pieceId,
            layers: [
              {
                id: "L0",
                piece: desired.pieceId,
                opacity: 1,
                blend: "normal",
                seed: desired.seed,
                parameters: apiParams,
              },
            ],
            modulation: mappings,
            post: { bloom: 0.2, feedback: 0.05 },
          },
        ],
        cues: [],
      };
  if (set.scenes[0] && (!set.scenes[0].modulation || set.scenes[0].modulation.length === 0)) {
    set.scenes[0].modulation = mappings;
  }
  return set;
}
