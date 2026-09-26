/**
 * Map Studio catalog selection to expected live runtime layer pieces.
 */

import { orderedScenes } from "../live/setModel";
import { compositionById } from "./compositions";
import { buildMashupSet } from "./mashups";

export function expectedRuntimePiecesForSelection(
  pieceId: string,
  compositionId: string | null,
  seed = 0,
): string[] {
  if (compositionId) {
    const recipe = compositionById(compositionId);
    const set = recipe?.build(seed, {});
    const layers = set ? (orderedScenes(set)[0]?.layers ?? []) : [];
    if (layers.length) return layers.map((l) => l.piece);
    return [];
  }
  const mashup = buildMashupSet(pieceId, seed, {});
  const mashupLayers = mashup ? orderedScenes(mashup)[0]?.layers : undefined;
  if (mashupLayers?.length) {
    return mashupLayers.map((l) => l.piece);
  }
  return [pieceId];
}
