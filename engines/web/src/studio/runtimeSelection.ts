/**
 * Map Studio catalog selection to expected live runtime layer pieces.
 */

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
    const layers = set?.scenes[0]?.layers ?? [];
    if (layers.length) return layers.map((l) => l.piece);
    return [];
  }
  const mashup = buildMashupSet(pieceId, seed, {});
  if (mashup?.scenes[0]?.layers?.length) {
    return mashup.scenes[0].layers.map((l) => l.piece);
  }
  return [pieceId];
}
