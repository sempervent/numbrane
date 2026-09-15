/**
 * Deterministic "More Like This" / series / mutation exploration (no ML).
 */

import { MUTATION_STRENGTH, type MutationScale } from "../style/pfl";

export type LockedParams = Set<string>;

export type VariantSpec = {
  seed: number;
  parameters: Record<string, number>;
  label: string;
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MUTATABLE = [
  "chaos",
  "density",
  "zoom",
  "hue",
  "exposure",
  "rotation",
  "f",
  "k",
  "field_scale",
  "growth_rate",
  "ink",
  "margin",
  "center_bias",
  "steps",
];

/** Meta aesthetic axes → concrete parameter nudges. */
export const META_AXES = {
  density: { param: "density", low: 0.25, high: 0.95 },
  chaos: { param: "chaos", low: 0.05, high: 0.9 },
  organic: { param: "chaos", low: 0.15, high: 0.7 },
  kinetic: { param: "zoom", low: 0.7, high: 1.4 },
  saturated: { param: "hue", low: 0.2, high: 0.85 },
  massive: { param: "exposure", low: 0.6, high: 1.6 },
} as const;

export type MetaAxis = keyof typeof META_AXES;

export function applyMetaAxis(
  params: Record<string, number>,
  axis: MetaAxis,
  value01: number,
): Record<string, number> {
  const def = META_AXES[axis];
  const next = { ...params };
  next[def.param] = def.low + (def.high - def.low) * Math.min(1, Math.max(0, value01));
  return next;
}

export function moreLikeThis(
  base: { seed: number; parameters: Record<string, number> },
  opts: {
    count?: number;
    locked?: LockedParams;
    mutationStrength?: number;
    mutationScale?: MutationScale;
    /** Narrow mutation around favorite recipes (rule-based, no ML). */
    favoriteBias?: Record<string, number>[];
  } = {},
): VariantSpec[] {
  const count = opts.count ?? 8;
  const locked = opts.locked ?? new Set<string>();
  const mutationStrength =
    opts.mutationStrength ??
    (opts.mutationScale ? MUTATION_STRENGTH[opts.mutationScale] : 0.18);
  const out: VariantSpec[] = [];
  const rng = mulberry32((base.seed ^ 0x9e3779b9) >>> 0);
  const biasCenter =
    opts.favoriteBias && opts.favoriteBias.length
      ? averageParams([base.parameters, ...opts.favoriteBias])
      : base.parameters;

  for (let i = 0; i < count; i++) {
    const seed = (base.seed + 1 + Math.floor(rng() * 1e6) + i * 9973) >>> 0;
    const parameters = { ...base.parameters };
    for (const key of MUTATABLE) {
      if (locked.has(key)) continue;
      if (locked.has("composition") && ["margin", "center_bias", "rotation", "ink"].includes(key)) {
        continue;
      }
      if (locked.has("palette") && key === "hue") continue;
      if (!(key in parameters) && !["chaos", "density", "zoom", "hue", "exposure"].includes(key)) {
        continue;
      }
      const cur = biasCenter[key] ?? parameters[key] ?? (key === "density" ? 0.7 : key === "chaos" ? 0.3 : 1);
      const delta = (rng() * 2 - 1) * mutationStrength;
      parameters[key] = Math.min(2.5, Math.max(0, cur + delta));
    }
    out.push({
      seed: locked.has("seed") ? base.seed : seed,
      parameters,
      label: `v${i + 1}`,
    });
  }
  return out;
}

function averageParams(list: Record<string, number>[]): Record<string, number> {
  const keys = new Set<string>();
  for (const p of list) for (const k of Object.keys(p)) keys.add(k);
  const out: Record<string, number> = {};
  for (const k of keys) {
    let s = 0;
    let n = 0;
    for (const p of list) {
      if (typeof p[k] === "number") {
        s += p[k]!;
        n += 1;
      }
    }
    if (n) out[k] = s / n;
  }
  return out;
}

/** Cohesive series: same recipe/style, controlled seed/param variation. */
export function generateSeries(
  base: { seed: number; parameters: Record<string, number> },
  opts: {
    count?: number;
    locked?: LockedParams;
    mutationScale?: MutationScale;
  } = {},
): VariantSpec[] {
  const count = opts.count ?? 8;
  const locked = new Set(opts.locked ?? []);
  // Series keeps style/palette/composition locked by default
  locked.add("palette");
  locked.add("composition");
  return moreLikeThis(base, {
    count,
    locked,
    mutationScale: opts.mutationScale ?? "subtle",
  }).map((v, i) => ({ ...v, label: `s${i + 1}` }));
}

export function seedVariants(pieceId: string, seeds: number[]): VariantSpec[] {
  return seeds.map((seed) => ({
    seed: seed >>> 0,
    parameters: {},
    label: `${pieceId.split("/").pop()}-${seed}`,
  }));
}
