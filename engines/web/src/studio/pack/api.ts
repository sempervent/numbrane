/**
 * Client helpers for PFL pack export / reload via render service.
 */

import type { PflPack } from "./types";
import { packToPerformanceSet, slugify } from "./types";

export type PackExportResult = {
  ok: boolean;
  slug: string;
  path: string;
  manifest_url?: string;
  contact_sheet_url?: string;
  error?: string;
};

export async function exportPackApi(
  pack: PflPack,
  opts: { preview?: boolean } = {},
): Promise<PackExportResult> {
  const slug = slugify(pack.name);
  const body = {
    pack: {
      ...pack,
      pack_id: `pfl-packs/${slug}`,
    },
    performance_set: packToPerformanceSet(pack),
    preview: !!opts.preview,
  };
  const res = await fetch("/api/pack/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return { ok: false, slug, path: "", error: await res.text() };
  }
  const data = (await res.json()) as PackExportResult;
  return { ...data, ok: true };
}

export async function loadPackManifest(slug: string): Promise<PflPack | null> {
  const res = await fetch(`/api/artifact/pfl-packs/${encodeURIComponent(slug)}/manifest.json`);
  if (!res.ok) return null;
  return (await res.json()) as PflPack;
}
