/**
 * Per-piece Geometry IR builders — never share a Metatron fallback across IDs.
 */

export type Center = { x: number; y: number; r: number };
export type Edge = { a: number; b: number };
export type GeomPrimitive = Record<string, number | string>;
export type GeomIR = {
  pieceId: string;
  seed: number;
  centers: Center[];
  edges: Edge[];
  primitives?: GeomPrimitive[];
  meta: Record<string, number | string | boolean>;
};

export const COMPOSITION_MODES = [
  "canonical",
  "construction",
  "cropped",
  "fragment",
  "off-axis",
  "layered",
] as const;

export type CompositionMode = (typeof COMPOSITION_MODES)[number];

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

function rotate(pts: Center[], angle: number): Center[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return pts.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c, r: p.r }));
}

function connectNear(centers: Center[], maxDist: number): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) {
      const dx = centers[i]!.x - centers[j]!.x;
      const dy = centers[i]!.y - centers[j]!.y;
      if (Math.hypot(dx, dy) <= maxDist + 1e-6) edges.push({ a: i, b: j });
    }
  }
  return edges;
}

function seedOfLife(r: number): Center[] {
  const centers: Center[] = [{ x: 0, y: 0, r }];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    centers.push({ x: Math.cos(a) * r * 2, y: Math.sin(a) * r * 2, r });
  }
  return centers;
}

function flowerOfLife(r: number, layers: number): Center[] {
  const centers: Center[] = [{ x: 0, y: 0, r }];
  const uniq = new Map<string, Center>();
  uniq.set("0,0", centers[0]!);
  for (let ring = 1; ring <= layers; ring++) {
    for (let i = 0; i < 6 * ring; i++) {
      const a = (i / (6 * ring)) * Math.PI * 2;
      const x = Math.cos(a) * r * 2 * ring;
      const y = Math.sin(a) * r * 2 * ring;
      const key = `${x.toFixed(5)},${y.toFixed(5)}`;
      if (!uniq.has(key)) uniq.set(key, { x, y, r });
    }
  }
  return [...uniq.values()];
}

function metatron(r: number, levels: number): { centers: Center[]; edges: Edge[] } {
  const centers = flowerOfLife(r, Math.max(1, levels));
  // Classic Metatron: all pairs among inner 13 (or full set when small)
  const n = Math.min(centers.length, 13 + (levels - 1) * 6);
  const edges: Edge[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) edges.push({ a: i, b: j });
  }
  return { centers, edges };
}

function sriYantra(scale: number, seed: number): Array<Record<string, number | string>> {
  const rnd = mulberry32(seed ^ 0x51a1);
  const wobble = 0.02 + rnd() * 0.04;
  const primitives: Array<Record<string, number | string>> = [];
  const upScales = [1.0, 0.78, 0.58, 0.42].map((s, i) => s * (1 + ((i % 2) * 2 - 1) * wobble * 0.5));
  const downScales = [0.92, 0.7, 0.52, 0.36, 0.22].map(
    (s, i) => s * (1 + ((i % 2) * 2 - 1) * wobble * 0.4),
  );
  for (const s of upScales) {
    const h = s * scale;
    const poly = [
      [0, h],
      [-h * 0.866, -h * 0.5],
      [h * 0.866, -h * 0.5],
      [0, h],
    ];
    for (let i = 0; i < 3; i++) {
      primitives.push({
        kind: "line",
        x1: poly[i]![0]!,
        y1: poly[i]![1]!,
        x2: poly[i + 1]![0]!,
        y2: poly[i + 1]![1]!,
      });
    }
  }
  for (const s of downScales) {
    const h = s * scale;
    const poly = [
      [0, -h],
      [-h * 0.866, h * 0.5],
      [h * 0.866, h * 0.5],
      [0, -h],
    ];
    for (let i = 0; i < 3; i++) {
      primitives.push({
        kind: "line",
        x1: poly[i]![0]!,
        y1: poly[i]![1]!,
        x2: poly[i + 1]![0]!,
        y2: poly[i + 1]![1]!,
      });
    }
  }
  primitives.push({ kind: "circle", cx: 0, cy: 0, r: scale });
  primitives.push({ kind: "circle", cx: 0, cy: 0, r: scale * 0.12 });
  return primitives;
}

function isometric(r: number, seed: number): Center[] {
  const rnd = mulberry32(seed ^ 0x150);
  const n = 4 + Math.floor(rnd() * 3);
  const centers: Center[] = [];
  for (let q = -n; q <= n; q++) {
    for (let rr = -n; rr <= n; rr++) {
      const s = -q - rr;
      if (Math.max(Math.abs(q), Math.abs(rr), Math.abs(s)) > n) continue;
      const x = r * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * rr);
      const y = r * ((3 / 2) * rr);
      centers.push({ x, y, r: r * 0.35 });
    }
  }
  return centers;
}

function circlePacking(seed: number, count: number): Center[] {
  const rnd = mulberry32(seed);
  const centers: Center[] = [];
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const rad = Math.sqrt(rnd()) * 0.95;
    const rr = 0.04 + rnd() * 0.1;
    centers.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad, r: rr });
  }
  return centers;
}

function circleLattice(r: number, seed: number): Center[] {
  const rnd = mulberry32(seed ^ 0xc1a);
  const rings = 2 + Math.floor(rnd() * 3);
  return flowerOfLife(r * (0.85 + rnd() * 0.3), rings);
}

function resolveCompositionMode(params: Record<string, number | string | boolean>): string {
  const raw = String(params.composition_mode ?? params["comp.mode"] ?? "canonical");
  return raw || "canonical";
}

/**
 * Mirror Python apply_geometry_composition — framing/subset only, not lattice math.
 * When `forAnimation` is true, construction keeps full IR and tags meta for progressive reveal.
 */
export function applyGeometryComposition(
  ir: GeomIR,
  mode: string,
  seed: number,
  opts: { forAnimation?: boolean } = {},
): GeomIR {
  if (!mode || mode === "canonical" || mode === "none") return ir;
  const rnd = mulberry32(seed ^ 0xc0ff);
  const out: GeomIR = {
    ...ir,
    centers: [...ir.centers],
    edges: [...ir.edges],
    primitives: ir.primitives ? [...ir.primitives] : undefined,
    meta: { ...ir.meta, composition_mode: mode },
  };

  if (mode === "construction") {
    out.meta.construction = true;
    if (!opts.forAnimation) {
      // Still: circles / centers only (authentic construction drawing)
      out.edges = [];
      if (out.primitives?.length) {
        out.primitives = out.primitives.filter((p) => p.kind === "circle");
      }
    }
    return out;
  }
  if (mode === "cropped") {
    out.meta.margin = 0.88;
    out.meta.center_bias = 0.85;
  } else if (mode === "detail") {
    out.meta.margin = 0.72;
    out.meta.center_bias = 0.92;
    out.meta.view_zoom = 1.35;
  } else if (mode === "off-axis") {
    out.meta.off_center_x = 0.12 + (seed % 5) * 0.04;
    out.meta.off_center_y = -0.08 + (seed % 7) * 0.03;
    out.meta.rotation = Number(out.meta.rotation ?? 0) + 0.18;
  } else if (mode === "layered") {
    if (out.primitives?.length) {
      const layered = out.primitives.map((p, i) => ({
        ...p,
        stroke: p.stroke || "#e8eef8",
        opacity: 0.35 + (0.45 * (i % 3)) / 2,
      }));
      out.primitives = [...layered, ...out.primitives];
    } else {
      // Duplicate centers at reduced radius as ghost layer
      const ghost = out.centers.map((c) => ({ ...c, r: c.r * 1.08 }));
      out.centers = [...ghost, ...out.centers];
      out.meta.layered = true;
    }
  } else if (mode === "fragment") {
    if (out.primitives?.length) {
      out.primitives = out.primitives.filter(() => rnd() > 0.45);
    } else {
      const keepMask = out.centers.map(() => rnd() > 0.45);
      const indexMap = new Map<number, number>();
      const kept: Center[] = [];
      out.centers.forEach((c, i) => {
        if (keepMask[i]) {
          indexMap.set(i, kept.length);
          kept.push(c);
        }
      });
      out.centers = kept.length > 0 ? kept : out.centers.slice(0, 1);
      if (kept.length === 0) indexMap.set(0, 0);
      out.edges = out.edges
        .filter((e) => indexMap.has(e.a) && indexMap.has(e.b) && rnd() > 0.55)
        .map((e) => ({ a: indexMap.get(e.a)!, b: indexMap.get(e.b)! }));
    }
  } else if (mode === "broken-symmetry") {
    if (out.centers.length > 2) {
      const cut = Math.max(1, Math.floor(out.centers.length / 2));
      out.centers = [...out.centers.slice(0, cut), ...out.centers.slice(cut + 1)];
    }
    out.edges = out.edges.filter((_, i) => i % 2 === 0);
    if (out.primitives?.length) {
      const cut = Math.max(1, Math.floor(out.primitives.length / 2));
      out.primitives = [...out.primitives.slice(0, cut), ...out.primitives.slice(cut + 1)];
    }
    out.meta.rotation = Number(out.meta.rotation ?? 0) + 0.42;
  }
  return out;
}

/**
 * Progressive authentic construction: centers → circles → edges → layers.
 * progress in [0, 1]. Prefer this over opacity fade-in.
 */
export function revealConstructionProgress(ir: GeomIR, progress: number): GeomIR {
  const t = Math.max(0, Math.min(1, progress));
  const meta = { ...ir.meta, construction_progress: t };

  // Phase A [0, 0.22): center points as tiny dots
  if (t < 0.22) {
    const n = Math.max(1, Math.ceil(ir.centers.length * (t / 0.22)));
    return {
      ...ir,
      centers: ir.centers.slice(0, n).map((c) => ({ ...c, r: Math.min(c.r, 0.04) })),
      edges: [],
      primitives: ir.primitives
        ?.filter((p) => p.kind === "circle")
        .slice(0, Math.max(1, Math.ceil((ir.primitives?.filter((p) => p.kind === "circle").length ?? 1) * (t / 0.22))))
        .map((p) => ({ ...p, r: Math.min(Number(p.r) || 0.04, 0.04) })),
      meta: { ...meta, construction_phase: "centers" },
    };
  }

  // Phase B [0.22, 0.48): full-radius circles appear
  if (t < 0.48) {
    const u = (t - 0.22) / 0.26;
    const n = Math.max(1, Math.ceil(ir.centers.length * u));
    const circlePrims = ir.primitives?.filter((p) => p.kind === "circle") ?? [];
    const cn = Math.max(1, Math.ceil(circlePrims.length * u));
    return {
      ...ir,
      centers: ir.centers.slice(0, n),
      edges: [],
      primitives: circlePrims.slice(0, cn),
      meta: { ...meta, construction_phase: "circles" },
    };
  }

  // Phase C [0.48, 0.78): edges / lines
  if (t < 0.78) {
    const u = (t - 0.48) / 0.3;
    const en = Math.ceil(ir.edges.length * u);
    const circles = ir.primitives?.filter((p) => p.kind === "circle") ?? [];
    const lines = ir.primitives?.filter((p) => p.kind === "line") ?? [];
    const ln = Math.ceil(lines.length * u);
    return {
      ...ir,
      centers: [...ir.centers],
      edges: ir.edges.slice(0, en),
      primitives: [...circles, ...lines.slice(0, ln)],
      meta: { ...meta, construction_phase: "edges" },
    };
  }

  // Phase D [0.78, 1]: layers / full (ghost layer opacity ramp for layered look)
  const u = (t - 0.78) / 0.22;
  const out: GeomIR = {
    ...ir,
    centers: [...ir.centers],
    edges: [...ir.edges],
    primitives: ir.primitives ? [...ir.primitives] : undefined,
    meta: { ...meta, construction_phase: "layers" },
  };
  if (u < 1 && out.primitives?.length) {
    out.primitives = out.primitives.map((p, i) =>
      i < out.primitives!.length / 2
        ? { ...p, opacity: 0.25 + 0.55 * u }
        : p,
    );
  } else if (u < 1 && ir.meta.layered) {
    // Soft-in ghost centers already present from layered mode
    out.meta.layer_reveal = u;
  }
  return out;
}

/**
 * Build piece-specific IR. Throws if pieceId is not a known geometry system.
 */
export function buildGeometryIr(
  pieceId: string,
  seed: number,
  params: Record<string, number | string | boolean> = {},
  opts: { forAnimation?: boolean; constructionProgress?: number } = {},
): GeomIR {
  const rnd = mulberry32(seed);
  const radius = Number(params["geom.radius"] ?? params.radius ?? 1);
  const levels = Math.max(1, Math.floor(Number(params["geom.levels"] ?? params.layers ?? 2)));
  const mode = resolveCompositionMode(params);
  // Seed-driven bounded variation: rotation + slight radius scale
  const rot =
    Number(params["geom.rotation"] ?? 0) + ((seed >>> 0) % 360) * (Math.PI / 180) * 0.15 + rnd() * 0.2;
  const r = radius * (0.9 + rnd() * 0.2);

  let ir: GeomIR;
  if (pieceId.includes("seed-of-life")) {
    const centers = rotate(seedOfLife(r), rot);
    ir = {
      pieceId,
      seed,
      centers,
      edges: connectNear(centers, r * 2.05),
      meta: { kind: "seed-of-life", nodes: centers.length },
    };
  } else if (pieceId.includes("flower-of-life")) {
    const centers = rotate(flowerOfLife(r, levels + Math.floor(rnd() * 2)), rot);
    ir = {
      pieceId,
      seed,
      centers,
      edges: connectNear(centers, r * 2.05),
      meta: { kind: "flower-of-life", nodes: centers.length, layers: levels },
    };
  } else if (pieceId.includes("metatron")) {
    const { centers, edges } = metatron(r, levels);
    ir = {
      pieceId,
      seed,
      centers: rotate(centers, rot),
      edges,
      meta: { kind: "metatron", nodes: centers.length, edges: edges.length },
    };
  } else if (pieceId.includes("sri-yantra")) {
    const primitives = sriYantra(r, seed);
    ir = {
      pieceId,
      seed,
      centers: [{ x: 0, y: 0, r }],
      edges: [],
      primitives,
      meta: { kind: "sri-yantra", primitives: primitives.length },
    };
  } else if (pieceId.includes("isometric")) {
    const centers = rotate(isometric(r * 0.55, seed), rot);
    ir = {
      pieceId,
      seed,
      centers,
      edges: connectNear(centers, r * 0.95),
      meta: { kind: "isometric", nodes: centers.length },
    };
  } else if (pieceId.includes("circle-packing")) {
    const count = Math.floor(Number(params.count ?? 60 + (seed % 40)));
    const centers = rotate(circlePacking(seed, count), rot);
    ir = {
      pieceId,
      seed,
      centers,
      edges: [],
      meta: { kind: "circle-packing", nodes: centers.length },
    };
  } else if (pieceId.includes("circle-lattice")) {
    const centers = rotate(circleLattice(r, seed), rot);
    ir = {
      pieceId,
      seed,
      centers,
      edges: connectNear(centers, r * 2.05),
      meta: { kind: "circle-lattice", nodes: centers.length },
    };
  } else {
    throw new Error(`no geometry IR generator for ${pieceId}`);
  }

  const composed = applyGeometryComposition(ir, mode, seed, {
    forAnimation: opts.forAnimation && mode === "construction",
  });
  if (
    opts.forAnimation &&
    mode === "construction" &&
    opts.constructionProgress !== undefined
  ) {
    return revealConstructionProgress(composed, opts.constructionProgress);
  }
  return composed;
}

export function geometryTopologyHash(ir: GeomIR): string {
  const parts = [
    ir.pieceId,
    String(ir.centers.length),
    String(ir.edges.length),
    String(ir.primitives?.length ?? 0),
    String(ir.meta.kind ?? ""),
  ];
  return parts.join("|");
}
