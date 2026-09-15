/**
 * Per-piece Geometry IR builders — never share a Metatron fallback across IDs.
 */

export type Center = { x: number; y: number; r: number };
export type Edge = { a: number; b: number };
export type GeomIR = {
  pieceId: string;
  seed: number;
  centers: Center[];
  edges: Edge[];
  primitives?: Array<Record<string, number | string>>;
  meta: Record<string, number | string>;
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

/**
 * Build piece-specific IR. Throws if pieceId is not a known geometry system.
 */
export function buildGeometryIr(
  pieceId: string,
  seed: number,
  params: Record<string, number | string | boolean> = {},
): GeomIR {
  const rnd = mulberry32(seed);
  const radius = Number(params["geom.radius"] ?? params.radius ?? 1);
  const levels = Math.max(1, Math.floor(Number(params["geom.levels"] ?? params.layers ?? 2)));
  // Seed-driven bounded variation: rotation + slight radius scale
  const rot =
    Number(params["geom.rotation"] ?? 0) + ((seed >>> 0) % 360) * (Math.PI / 180) * 0.15 + rnd() * 0.2;
  const r = radius * (0.9 + rnd() * 0.2);

  if (pieceId.includes("seed-of-life")) {
    const centers = rotate(seedOfLife(r), rot);
    return {
      pieceId,
      seed,
      centers,
      edges: connectNear(centers, r * 2.05),
      meta: { kind: "seed-of-life", nodes: centers.length },
    };
  }
  if (pieceId.includes("flower-of-life")) {
    const centers = rotate(flowerOfLife(r, levels + Math.floor(rnd() * 2)), rot);
    return {
      pieceId,
      seed,
      centers,
      edges: connectNear(centers, r * 2.05),
      meta: { kind: "flower-of-life", nodes: centers.length, layers: levels },
    };
  }
  if (pieceId.includes("metatron")) {
    const { centers, edges } = metatron(r, levels);
    return {
      pieceId,
      seed,
      centers: rotate(centers, rot),
      edges,
      meta: { kind: "metatron", nodes: centers.length, edges: edges.length },
    };
  }
  if (pieceId.includes("sri-yantra")) {
    const primitives = sriYantra(r, seed);
    return {
      pieceId,
      seed,
      centers: [{ x: 0, y: 0, r }],
      edges: [],
      primitives,
      meta: { kind: "sri-yantra", primitives: primitives.length },
    };
  }
  if (pieceId.includes("isometric")) {
    const centers = rotate(isometric(r * 0.55, seed), rot);
    return {
      pieceId,
      seed,
      centers,
      edges: connectNear(centers, r * 0.95),
      meta: { kind: "isometric", nodes: centers.length },
    };
  }
  if (pieceId.includes("circle-packing")) {
    const count = Math.floor(Number(params.count ?? 60 + (seed % 40)));
    const centers = rotate(circlePacking(seed, count), rot);
    return {
      pieceId,
      seed,
      centers,
      edges: [],
      meta: { kind: "circle-packing", nodes: centers.length },
    };
  }
  if (pieceId.includes("circle-lattice")) {
    const centers = rotate(circleLattice(r, seed), rot);
    return {
      pieceId,
      seed,
      centers,
      edges: connectNear(centers, r * 2.05),
      meta: { kind: "circle-lattice", nodes: centers.length },
    };
  }
  throw new Error(`no geometry IR generator for ${pieceId}`);
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
