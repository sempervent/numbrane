/**
 * PFL performance catalog — curated animated visuals (not every manifest piece is equal).
 */

import type { PieceInfo } from "../catalog";
import { supportsMode } from "../runtime/registry";

export type PerformanceDensity = "sparse" | "medium" | "dense";
export type PerformanceMotion = "calm" | "moderate" | "intense";
export type PerformanceRole =
  | "intro"
  | "build"
  | "peak"
  | "transition"
  | "midnight"
  | "aftermath"
  | "interstitial"
  | "geometry";

export type PerformanceTier = "showcase" | "curated" | "experimental" | "hidden";

export type PerformancePieceMeta = {
  pieceId: string;
  tier: PerformanceTier;
  density: PerformanceDensity;
  motion: PerformanceMotion;
  roles: PerformanceRole[];
  character: string;
  previewSeed: number;
  previewFrame?: number;
  previewParams?: Record<string, number | string | boolean>;
  tags?: string[];
};

/** Authoritative PFL-first performance set (~18 strong animated candidates). */
export const PERFORMANCE_CATALOG: PerformancePieceMeta[] = [
  {
    pieceId: "fractals/sdf-raymarch2d",
    tier: "showcase",
    density: "dense",
    motion: "intense",
    roles: ["peak", "midnight", "transition"],
    character: "Deep SDF fields, bone-black signal",
    previewSeed: 91337,
    previewParams: { density: 0.62, palette: "bone-black", pfl_style: "pfl-signal" },
    tags: ["shader", "midnight"],
  },
  {
    pieceId: "reaction-diffusion/reaction-diffusion",
    tier: "showcase",
    density: "dense",
    motion: "moderate",
    roles: ["build", "midnight", "transition"],
    character: "Organic coral / organism crawl",
    previewSeed: 44021,
    previewParams: { preset: "coral", pfl_style: "pfl-organism" },
    tags: ["stateful", "midnight"],
  },
  {
    pieceId: "flagship/latticefall",
    tier: "showcase",
    density: "dense",
    motion: "intense",
    roles: ["peak", "midnight", "transition"],
    character: "Falling lattice fracture",
    previewSeed: 12007,
    tags: ["flagship", "midnight"],
  },
  {
    pieceId: "geometry/metatron",
    tier: "showcase",
    density: "medium",
    motion: "moderate",
    roles: ["geometry", "midnight", "build"],
    character: "Sacred construction / ritual diagram",
    previewSeed: 271828,
    previewParams: {
      density: 0.72,
      composition_mode: "construction",
      pfl_style: "pfl-ritual",
      palette: "bone-black",
    },
    tags: ["geometry", "midnight", "construction"],
  },
  {
    pieceId: "geometry/flower-of-life",
    tier: "curated",
    density: "medium",
    motion: "calm",
    roles: ["geometry", "intro", "interstitial"],
    character: "Layered circles, ceremonial calm",
    previewSeed: 31415,
    previewParams: { pfl_style: "pfl-ritual", palette: "bone-black" },
    tags: ["geometry"],
  },
  {
    pieceId: "geometry/sri-yantra",
    tier: "curated",
    density: "dense",
    motion: "moderate",
    roles: ["geometry", "peak", "midnight"],
    character: "Triangular depth, tantric density",
    previewSeed: 1618,
    previewParams: { pfl_style: "pfl-ritual" },
    tags: ["geometry", "midnight"],
  },
  {
    pieceId: "fractals/strange-attractors",
    tier: "curated",
    density: "medium",
    motion: "intense",
    roles: ["peak", "build"],
    character: "Chaotic attractor trails",
    previewSeed: 113,
    tags: ["fractal"],
  },
  {
    pieceId: "fractals/escape-time",
    tier: "curated",
    density: "dense",
    motion: "moderate",
    roles: ["build", "midnight", "transition"],
    character: "Escape-time omen fields",
    previewSeed: 777,
    tags: ["fractal", "midnight"],
  },
  {
    pieceId: "growth/slime-mold",
    tier: "curated",
    density: "dense",
    motion: "moderate",
    roles: ["build", "interstitial"],
    character: "Network growth, biological tension",
    previewSeed: 7,
    tags: ["organic"],
  },
  {
    pieceId: "growth/differential-growth",
    tier: "curated",
    density: "medium",
    motion: "moderate",
    roles: ["build", "transition"],
    character: "Edge tension, morphing membranes",
    previewSeed: 19,
    tags: ["organic"],
  },
  {
    pieceId: "particles/noodles",
    tier: "curated",
    density: "dense",
    motion: "intense",
    roles: ["peak", "interstitial"],
    character: "Kinetic noodle swarm",
    previewSeed: 9,
    tags: ["particles"],
  },
  {
    pieceId: "fields/flow-hatching",
    tier: "curated",
    density: "medium",
    motion: "calm",
    roles: ["intro", "interstitial", "aftermath"],
    character: "Flow hatching, readable texture",
    previewSeed: 44,
    tags: ["fields"],
  },
  {
    pieceId: "tiling/truchet-tiles",
    tier: "curated",
    density: "dense",
    motion: "moderate",
    roles: ["transition", "interstitial"],
    character: "Truchet drift, graphic rhythm",
    previewSeed: 88,
    tags: ["tiling"],
  },
  {
    pieceId: "reference/circle-lattice",
    tier: "experimental",
    density: "medium",
    motion: "moderate",
    roles: ["geometry", "interstitial"],
    character: "Reference lattice motion",
    previewSeed: 42,
    tags: ["reference"],
  },
  {
    pieceId: "mashups/ritual-diagrams",
    tier: "curated",
    density: "dense",
    motion: "moderate",
    roles: ["geometry", "midnight", "peak"],
    character: "Stacked ritual diagram mashup",
    previewSeed: 555,
    previewParams: { pfl_style: "pfl-ritual" },
    tags: ["geometry", "midnight"],
  },
];

const byId = new Map(PERFORMANCE_CATALOG.map((m) => [m.pieceId, m]));

export function performanceMeta(pieceId: string): PerformancePieceMeta | undefined {
  return byId.get(pieceId);
}

export function performanceTier(pieceId: string): PerformanceTier {
  return byId.get(pieceId)?.tier ?? "experimental";
}

export function isBrowserListedPiece(pieceId: string): boolean {
  const t = performanceTier(pieceId);
  return t !== "hidden";
}

export type PerformanceBrowserFilter =
  | "curated"
  | "shortlist"
  | "midnight"
  | "dense"
  | "calm"
  | "intense"
  | "geometry"
  | "all-animated";

export function filterPerformanceCatalog(
  pieces: PieceInfo[],
  filter: PerformanceBrowserFilter,
  shortlist: string[],
): PieceInfo[] {
  const animateCap = (p: PieceInfo) => supportsMode(p.piece_id, "animate");
  let list = pieces.filter((p) => isBrowserListedPiece(p.piece_id) && animateCap(p));

  switch (filter) {
    case "curated":
      list = list.filter((p) => {
        const t = performanceTier(p.piece_id);
        return t === "showcase" || t === "curated";
      });
      break;
    case "shortlist":
      list = list.filter((p) => shortlist.includes(p.piece_id));
      break;
    case "midnight":
      list = list.filter((p) => performanceMeta(p.piece_id)?.roles.includes("midnight"));
      break;
    case "dense":
      list = list.filter((p) => {
        const d = performanceMeta(p.piece_id)?.density;
        return d === "dense" || d === "medium";
      });
      break;
    case "calm":
      list = list.filter((p) => performanceMeta(p.piece_id)?.motion === "calm");
      break;
    case "intense":
      list = list.filter((p) => performanceMeta(p.piece_id)?.motion === "intense");
      break;
    case "geometry":
      list = list.filter(
        (p) =>
          performanceMeta(p.piece_id)?.roles.includes("geometry") ||
          p.piece_id.startsWith("geometry/"),
      );
      break;
    case "all-animated":
      break;
  }

  const order = new Map(PERFORMANCE_CATALOG.map((m, i) => [m.pieceId, i]));
  list.sort((a, b) => {
    const ta = performanceTier(a.piece_id);
    const tb = performanceTier(b.piece_id);
    const rank = (t: PerformanceTier) =>
      t === "showcase" ? 0 : t === "curated" ? 1 : t === "experimental" ? 2 : 3;
    const dr = rank(ta) - rank(tb);
    if (dr !== 0) return dr;
    return (order.get(a.piece_id) ?? 999) - (order.get(b.piece_id) ?? 999);
  });
  return list;
}

/** Recommended Episode 1 rehearsal order (Animate mode). */
export const PFL_EPISODE_1_FLOW: {
  segment: string;
  pieceId: string;
  note: string;
}[] = [
  { segment: "intro", pieceId: "fields/flow-hatching", note: "Calm texture, establish space" },
  { segment: "intro", pieceId: "geometry/flower-of-life", note: "Ceremonial geometry" },
  { segment: "build", pieceId: "growth/slime-mold", note: "Organic tension rise" },
  { segment: "build", pieceId: "fractals/escape-time", note: "Omen / pressure" },
  { segment: "transition", pieceId: "tiling/truchet-tiles", note: "Graphic bridge" },
  { segment: "peak", pieceId: "particles/noodles", note: "Energy peak" },
  { segment: "transition", pieceId: "flagship/latticefall", note: "Fracture into midnight" },
  { segment: "midnight", pieceId: "fractals/sdf-raymarch2d", note: "Midnight signal field" },
  { segment: "midnight", pieceId: "reaction-diffusion/reaction-diffusion", note: "Organism / devour" },
  { segment: "midnight", pieceId: "geometry/metatron", note: "Construction / ritual anchor" },
  { segment: "midnight", pieceId: "geometry/sri-yantra", note: "Impossible diagram depth" },
  { segment: "aftermath", pieceId: "fields/flow-hatching", note: "Comedown texture" },
  { segment: "outro", pieceId: "fractals/strange-attractors", note: "Dissolve / echo" },
];

export const MIDNIGHT_ROLES: {
  role: string;
  pieceId: string;
  pacing: string;
  transitionIn: string;
  transitionOut: string;
}[] = [
  {
    role: "warning / omen",
    pieceId: "fractals/escape-time",
    pacing: "slow creep",
    transitionIn: "crossfade from build",
    transitionOut: "cut or crossfade to fracture",
  },
  {
    role: "fracture / destabilization",
    pieceId: "flagship/latticefall",
    pacing: "accelerating",
    transitionIn: "hard cut or short crossfade",
    transitionOut: "crossfade to signal field",
  },
  {
    role: "midnight signal / void mouth",
    pieceId: "fractals/sdf-raymarch2d",
    pacing: "continuous pulse",
    transitionIn: "crossfade",
    transitionOut: "crossfade to organism",
  },
  {
    role: "collapse / devouring",
    pieceId: "reaction-diffusion/reaction-diffusion",
    pacing: "slow organic",
    transitionIn: "crossfade",
    transitionOut: "crossfade to construction",
  },
  {
    role: "ritual construction",
    pieceId: "geometry/metatron",
    pacing: "construction hold + breathe",
    transitionIn: "crossfade",
    transitionOut: "crossfade to yantra or aftermath",
  },
  {
    role: "impossible aftermath",
    pieceId: "geometry/sri-yantra",
    pacing: "dense hold",
    transitionIn: "crossfade",
    transitionOut: "long crossfade out",
  },
];
