/**
 * Piece catalog from manifests (served at /catalog/pieces.json).
 */

export type PieceCapabilities = {
  still?: boolean;
  animated?: boolean;
  realtime?: boolean;
  audio_reactive?: boolean;
  interactive?: boolean;
  webgl?: boolean;
  wasm?: boolean;
};

export type PieceInfo = {
  piece_id: string;
  title?: string;
  name?: string;
  family?: string;
  description?: string;
  engine?: string;
  capabilities: PieceCapabilities;
  tags?: string[];
};

export async function fetchPieceCatalog(): Promise<PieceInfo[]> {
  const res = await fetch("/catalog/pieces.json");
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
  const data = (await res.json()) as { pieces: PieceInfo[] };
  return data.pieces ?? [];
}

export function familyOf(pieceId: string): string {
  return pieceId.split("/")[0] ?? "other";
}

export function matchesFilter(p: PieceInfo, filter: string): boolean {
  const f = filter.toLowerCase();
  if (!f || f === "all") return true;
  const caps = p.capabilities || {};
  const family = (p.family || familyOf(p.piece_id)).toLowerCase();
  switch (f) {
    case "still":
      return !!caps.still;
    case "animated":
      return !!caps.animated;
    case "realtime":
      return !!caps.realtime;
    case "audio-reactive":
      return !!caps.audio_reactive;
    case "interactive":
      return !!caps.interactive;
    case "geometry":
    case "growth":
    case "fields":
    case "fractals":
    case "tiling":
    case "particles":
    case "mashups":
    case "landscape":
    case "audiovisual":
    case "flagship":
    case "reaction-diffusion":
      return family === f || family.startsWith(f);
    default:
      return (
        p.piece_id.includes(f) ||
        (p.title || p.name || "").toLowerCase().includes(f) ||
        family.includes(f)
      );
  }
}
