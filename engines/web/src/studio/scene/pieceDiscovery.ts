/**
 * CREATE piece catalog — labels, family taxonomy, lightweight filtering.
 */

import type { PieceInfo } from "../catalog";
import type { StudioMode } from "../keyboard/registry";
import { behaviorFamilyForPiece, listCompatibleBehaviors } from "./behaviorPresets";

export function pieceDisplayLabel(p: PieceInfo): string {
  return p.title || p.name || p.piece_id.split("/").pop() || p.piece_id;
}

export function pieceFamilyLabel(pieceId: string): string {
  const f = behaviorFamilyForPiece(pieceId);
  return f.charAt(0).toUpperCase() + f.slice(1);
}

export function createCatalogFamilyOptions(pieces: PieceInfo[]): string[] {
  const families = new Set<string>();
  for (const p of pieces) families.add(behaviorFamilyForPiece(p.piece_id));
  return ["all", ...Array.from(families).sort()];
}

export function filterCreateCatalogPieces(
  pieces: PieceInfo[],
  mode: StudioMode,
  familyFilter: string,
): PieceInfo[] {
  let list = [...pieces];
  if (mode === "animate" || mode === "react") {
    list = list.filter((p) => p.capabilities?.animated !== false);
  }
  if (familyFilter && familyFilter !== "all") {
    list = list.filter((p) => behaviorFamilyForPiece(p.piece_id) === familyFilter);
  }
  list.sort((a, b) => pieceDisplayLabel(a).localeCompare(pieceDisplayLabel(b)));
  return list;
}

export function compatibleBehaviorCount(pieceId: string): number {
  return listCompatibleBehaviors(pieceId).filter((b) => !b.disabled).length;
}
