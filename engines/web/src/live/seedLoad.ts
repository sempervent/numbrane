/**
 * Load Seed Artifact manifests into LIVE (parameter/state hints).
 * Structured arrays remain offline-continued; LIVE consumes recipe seed + preview cues.
 */

export type SeedManifest = {
  piece_id: string;
  seed: number;
  frame?: number;
  recipe?: Record<string, unknown>;
  artifact_type?: string;
  preview?: { png?: string; svg?: string };
  content_digest?: string;
};

export async function fetchSeedManifest(url: string): Promise<SeedManifest> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`seed fetch failed: ${res.status}`);
  return (await res.json()) as SeedManifest;
}

export function applySeedToParams(
  manifest: SeedManifest,
): Record<string, number> {
  const params: Record<string, number> = {};
  const recipe = (manifest.recipe || {}) as { parameters?: Record<string, unknown> };
  const p = recipe.parameters || {};
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === "number") params[k.replace(/^.*\./, "")] = v;
  }
  if (manifest.frame != null) params.frame = manifest.frame;
  params.seed = manifest.seed >>> 0;
  return params;
}
