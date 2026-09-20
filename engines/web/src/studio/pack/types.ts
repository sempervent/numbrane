/**
 * PFL production pack — lightweight show/episode export object.
 * Performance half is a NAP live Set; pack manifest carries stills/sections.
 */

export type PackStillPreset = "episode-16x9" | "projection-16x9" | "square" | "portrait";
export type PackAnimPreset = "loop-6s" | "loop-12s" | "section-20s" | "section-30s";
export type PackItemKind = "still" | "animation" | "react";

export type PackItem = {
  id: string;
  kind: PackItemKind;
  pieceId: string;
  seed: number;
  frame: number;
  styleId?: string;
  parameters: Record<string, number | string | boolean>;
  durationSec: number;
  /** Legacy recipe label; maps to Studio animation method when present. */
  animArc: string;
  transitionIn: string;
  transitionOut: string;
  notes: string;
  stillPreset: PackStillPreset;
  animPreset: PackAnimPreset;
  animFormat: "webp" | "webm" | "apng";
};

export type PflPack = {
  protocol_version: "0.1.0";
  pack_id: string;
  name: string;
  description: string;
  style: string;
  created_at: string;
  items: PackItem[];
  still_preset: PackStillPreset;
  output_root?: string;
  exports?: Array<{ item_id: string; kind: string; path: string }>;
};

export const STILL_PRESETS: Record<
  PackStillPreset,
  { label: string; width: number; height: number }
> = {
  "episode-16x9": { label: "Episode 16:9 · 3840×2160", width: 3840, height: 2160 },
  "projection-16x9": { label: "Projection 16:9 · 1920×1080", width: 1920, height: 1080 },
  square: { label: "Square · 2160×2160", width: 2160, height: 2160 },
  portrait: { label: "Portrait · 2160×3840", width: 2160, height: 3840 },
};

export const ANIM_PRESETS: Record<PackAnimPreset, { label: string; durationSec: number }> = {
  "loop-6s": { label: "Loop 6s", durationSec: 6 },
  "loop-12s": { label: "Loop 12s", durationSec: 12 },
  "section-20s": { label: "Section 20s", durationSec: 20 },
  "section-30s": { label: "Section 30s", durationSec: 30 },
};

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "pfl-pack";
}

let _itemSeq = 0;

export function newItemId(): string {
  _itemSeq += 1;
  return `item-${_itemSeq.toString(36).padStart(4, "0")}`;
}

export function emptyPack(name = "PFL Pack"): PflPack {
  const pack_id = `pfl-packs/${slugify(name)}`;
  return {
    protocol_version: "0.1.0",
    pack_id,
    name,
    description: "",
    style: "",
    created_at: new Date(0).toISOString(),
    items: [],
    still_preset: "projection-16x9",
  };
}

export function itemFromLook(opts: {
  pieceId: string;
  seed: number;
  frame?: number;
  styleId?: string;
  parameters: Record<string, number | string | boolean>;
  kind?: PackItemKind;
  animArc?: string;
}): PackItem {
  return {
    id: newItemId(),
    kind: opts.kind ?? "still",
    pieceId: opts.pieceId,
    seed: opts.seed >>> 0,
    frame: opts.frame ?? 0,
    styleId: opts.styleId || undefined,
    parameters: { ...opts.parameters },
    durationSec: 12,
    animArc: opts.animArc ?? "emergence",
    transitionIn: "crossfade",
    transitionOut: "crossfade",
    notes: "",
    stillPreset: "projection-16x9",
    animPreset: "loop-12s",
    animFormat: "webp",
  };
}

/** Build NAP live Set from pack animation/react sections (ordered scenes). */
export function packToPerformanceSet(pack: PflPack): Record<string, unknown> {
  const animItems = pack.items.filter((i) => i.kind === "animation" || i.kind === "react");
  const scenes = animItems.map((item, idx) => {
    const maps =
      item.kind === "react"
        ? [
            {
              id: "m-energy",
              source: "audio.energy",
              destination: "layer.L0.density",
              amount: 0.3,
              min: 0.2,
              max: 1.2,
            },
            {
              id: "m-onset",
              source: "audio.onset",
              destination: "layer.L0.chaos",
              amount: 0.25,
              min: 0,
              max: 0.9,
            },
          ]
        : [];
    return {
      id: `s${idx + 1}-${item.id}`,
      name: `${String(idx + 1).padStart(2, "0")} · ${item.pieceId.split("/").pop()}`,
      layers: [
        {
          id: "L0",
          piece: item.pieceId,
          opacity: 1,
          seed: item.seed,
          parameters: {
            ...item.parameters,
            ...(item.styleId ? { pfl_style: item.styleId } : {}),
          },
        },
      ],
      modulation: maps,
      post: { bloom: 0.15, vignette: 0.12 },
    };
  });
  if (!scenes.length) {
    const fallback = pack.items[0];
    scenes.push({
      id: "s1-placeholder",
      name: "Placeholder",
      layers: [
        {
          id: "L0",
          piece: fallback?.pieceId || "geometry/metatron",
          opacity: 1,
          seed: fallback?.seed ?? 42,
          parameters: fallback?.parameters ?? { density: 0.6 },
        },
      ],
      modulation: [],
      post: { bloom: 0.12, vignette: 0.1 },
    });
  }
  return {
    protocol_version: "0.1.0",
    set_id: pack.pack_id.replace(/\//g, "-"),
    name: pack.name,
    bpm: 96,
    default_transition: { type: "crossfade", duration_beats: 4 },
    scenes,
    cues: [],
  };
}

export function reorderItems(items: PackItem[], from: number, to: number): PackItem[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (!moved) return items;
  next.splice(to, 0, moved);
  return next;
}

const PACK_KEY = "numbrane.studio.pack.v1";

export function loadPackDraft(): PflPack | null {
  try {
    const raw = localStorage.getItem(PACK_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PflPack;
  } catch {
    return null;
  }
}

export function savePackDraft(pack: PflPack): void {
  try {
    localStorage.setItem(PACK_KEY, JSON.stringify(pack));
  } catch {
    /* ignore quota */
  }
}

/** Load a pack definition committed under pieces/pfl/<slug>/pack.json */
export async function fetchPackFixture(slug: string): Promise<PflPack | null> {
  const res = await fetch(`/pieces/pfl/${encodeURIComponent(slug)}/pack.json`);
  if (!res.ok) return null;
  return (await res.json()) as PflPack;
}
