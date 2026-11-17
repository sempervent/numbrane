/**
 * PFL artwork kind identifiers and URL persistence.
 */

export const ARTWORK_IDS = ["flow-field", "fractal-morph", "block-lattice"] as const;
export type ArtworkId = (typeof ARTWORK_IDS)[number];

export function isArtworkId(v: string): v is ArtworkId {
  return (ARTWORK_IDS as readonly string[]).includes(v);
}

export function parseArtworkFromUrl(raw: string | null): ArtworkId {
  if (raw && isArtworkId(raw)) return raw;
  return "flow-field";
}

export function artworkDisplayName(id: ArtworkId): string {
  switch (id) {
    case "flow-field":
      return "Flow Field";
    case "fractal-morph":
      return "Fractal Morph";
    case "block-lattice":
      return "Block Lattice";
  }
}

/** Deterministic next variation seed (shared across types). */
export function nextVariationSeed(seed: number): number {
  let x = seed >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x + 0x9e3779b9) >>> 0;
}

export function syncUrlParams(type: ArtworkId, seed: number): void {
  const u = new URL(location.href);
  u.searchParams.set("type", type);
  u.searchParams.set("seed", String(seed >>> 0));
  history.replaceState(null, "", u.pathname + u.search);
}
