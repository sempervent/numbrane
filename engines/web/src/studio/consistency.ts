/**
 * Cross-surface Studio consistency — selector, runtime, diagnostics, URL must agree.
 */

import type { LiveSession } from "../live/session";
import { rendererKindFor, studioSurface } from "./runtime/surface";
import type { StudioMode } from "./keyboard/registry";
import { animationMethodsForPiece, RANDOM_METHOD_ID } from "./animation/methods";
import { expectedRuntimePiecesForSelection } from "./runtimeSelection";

export type StudioConsistencySnapshot = {
  desiredPieceId: string;
  pieceSelector: string | null;
  perfPieceLabel: string | null;
  metaStripPiece: string | null;
  urlPiece: string | null;
  diagnosticsPiece: string | null;
  runtimeLayers: Array<{ id: string; piece: string }>;
  animationMethodId: string;
  activeAnimationMethodId: string;
  animationMethodValid: boolean;
  mode: StudioMode;
  modeBar: string | null;
  configHeaderMode: string | null;
  diagnosticsMode: string | null;
  compositionId: string | null;
  sceneGeneration: number;
  committedSceneGeneration: number;
  consistency: { ok: boolean; mismatches: string[] };
};

export function collectStudioConsistency(input: {
  pieceId: string;
  mode: StudioMode;
  compositionId: string | null;
  animationMethodId: string;
  activeAnimationMethodId: string;
  sceneGeneration: number;
  committedSceneGeneration: number;
  session: LiveSession | null;
  document?: Document;
  locationSearch?: string;
}): StudioConsistencySnapshot {
  const doc = input.document ?? (typeof document !== "undefined" ? document : undefined);
  const selector =
    (doc?.querySelector("#cfg-piece") as HTMLSelectElement | null)?.value ??
    (doc?.querySelector(`#browser .piece.selected`)?.getAttribute("data-piece-id") ?? null);
  const perfLabel = doc?.getElementById("perf-piece")?.textContent?.trim() ?? null;
  const metaStrip = doc?.getElementById("meta-strip")?.textContent ?? null;
  const metaPiece = metaStrip?.match(/·\s([^·]+)\s·/)?.[1]?.trim() ?? null;
  const modeBar =
    doc?.querySelector("#modebar button.active")?.getAttribute("data-mode") ?? null;
  const configHeader = doc?.querySelector("#config h1")?.textContent?.trim() ?? null;

  let urlPiece: string | null = null;
  const search = input.locationSearch ?? (typeof location !== "undefined" ? location.search : "");
  if (search) {
    urlPiece = new URLSearchParams(search).get("piece");
  }

  const runtimeLayers =
    input.session?.getLayerPerformanceStates().map((l) => ({ id: l.id, piece: l.piece })) ?? [];
  const expectedLayers = expectedRuntimePiecesForSelection(
    input.pieceId,
    input.compositionId,
    0,
  );
  const allowedMethods = new Set(animationMethodsForPiece(input.pieceId).map((m) => m.id));
  const methodValid =
    input.animationMethodId === RANDOM_METHOD_ID ||
    allowedMethods.has(input.animationMethodId);

  const mismatches: string[] = [];
  if (selector && selector !== input.pieceId) {
    mismatches.push(`pieceSelector:${selector}!=desired:${input.pieceId}`);
  }
  if (perfLabel && perfLabel !== input.pieceId.split("/").pop()) {
    mismatches.push(`perfLabel:${perfLabel}!=desiredTail:${input.pieceId.split("/").pop()}`);
  }
  if (metaPiece && metaPiece !== input.pieceId) {
    mismatches.push(`metaStrip:${metaPiece}!=desired:${input.pieceId}`);
  }
  if (urlPiece && urlPiece !== input.pieceId) {
    mismatches.push(`url:${urlPiece}!=desired:${input.pieceId}`);
  }
  if (!methodValid) {
    mismatches.push(`animationMethod:${input.animationMethodId} invalid for ${input.pieceId}`);
  }
  if (input.committedSceneGeneration !== input.sceneGeneration) {
    mismatches.push(
      `sceneGen:committed=${input.committedSceneGeneration}!=current=${input.sceneGeneration}`,
    );
  }

  const runtimeOk = layersMatchExpected(runtimeLayers, expectedLayers);
  if (!runtimeOk.ok) {
    mismatches.push(...runtimeOk.reasons);
  }

  if (modeBar && modeBar !== input.mode) {
    mismatches.push(`modeBar:${modeBar}!=mode:${input.mode}`);
  }

  return {
    desiredPieceId: input.pieceId,
    pieceSelector: selector,
    perfPieceLabel: perfLabel,
    metaStripPiece: metaPiece,
    urlPiece,
    diagnosticsPiece: input.pieceId,
    runtimeLayers,
    animationMethodId: input.animationMethodId,
    activeAnimationMethodId: input.activeAnimationMethodId,
    animationMethodValid: methodValid,
    mode: input.mode,
    modeBar,
    configHeaderMode: configHeader,
    diagnosticsMode: input.mode,
    compositionId: input.compositionId,
    sceneGeneration: input.sceneGeneration,
    committedSceneGeneration: input.committedSceneGeneration,
    consistency: { ok: mismatches.length === 0, mismatches },
  };
}

function layersMatchExpected(
  runtime: Array<{ id: string; piece: string }>,
  expected: string[],
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const runtimePieces = runtime.map((l) => l.piece).sort();
  const exp = [...expected].sort();
  if (runtimePieces.length !== exp.length) {
    reasons.push(`runtimeLayerCount:${runtimePieces.length}!=expected:${exp.length}`);
  }
  for (let i = 0; i < Math.max(runtimePieces.length, exp.length); i++) {
    if (runtimePieces[i] !== exp[i]) {
      reasons.push(`runtimeLayer[${i}]:${runtimePieces[i] ?? "—"}!=${exp[i] ?? "—"}`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}
