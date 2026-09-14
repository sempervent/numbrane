/**
 * Deterministic "More Like This" / variant exploration (no ML).
 */

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
  } = {},
): VariantSpec[] {
  const count = opts.count ?? 8;
  const locked = opts.locked ?? new Set<string>();
  const mutationStrength = opts.mutationStrength ?? 0.18;
  const out: VariantSpec[] = [];
  const rng = mulberry32((base.seed ^ 0x9e3779b9) >>> 0);
  for (let i = 0; i < count; i++) {
    const seed = (base.seed + 1 + Math.floor(rng() * 1e6) + i * 9973) >>> 0;
    const parameters = { ...base.parameters };
    for (const key of MUTATABLE) {
      if (locked.has(key)) continue;
      if (!(key in parameters) && !["chaos", "density", "zoom", "hue", "exposure"].includes(key)) {
        continue;
      }
      const cur = parameters[key] ?? (key === "density" ? 0.7 : key === "chaos" ? 0.3 : 1);
      const delta = (rng() * 2 - 1) * mutationStrength;
      parameters[key] = Math.min(2, Math.max(0, cur + delta));
    }
    out.push({
      seed: locked.has("seed") ? base.seed : seed,
      parameters,
      label: `v${i + 1}`,
    });
  }
  return out;
}

export function seedVariants(pieceId: string, seeds: number[]): VariantSpec[] {
  return seeds.map((seed, i) => ({
    seed: seed >>> 0,
    parameters: {},
    label: `${pieceId.split("/").pop()}-${seed}`,
  }));
}
