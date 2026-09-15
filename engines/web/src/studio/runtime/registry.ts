/**
 * Explicit piece runtime registry — no silent generic-shader fallback.
 */

export type RendererKind =
  | "python-api"
  | "geometry-ir"
  | "webgl-stateful"
  | "wasm"
  | "shader-native"
  | "unsupported";

export type ParamField = {
  key: string;
  label: string;
  type: "number" | "choice" | "boolean";
  min?: number;
  max?: number;
  step?: number;
  choices?: string[];
  default: number | string | boolean;
};

export type PieceRuntimeDescriptor = {
  pieceId: string;
  generate: RendererKind;
  animate: RendererKind | null;
  react: RendererKind | null;
  seedSensitive: boolean;
  /** Seed changes topology/state, not only hue. */
  seedAffectsStructure: boolean;
  paramSchema: ParamField[];
};

const META: ParamField[] = [
  { key: "density", label: "Density", type: "number", min: 0, max: 1.5, step: 0.01, default: 0.7 },
  { key: "chaos", label: "Chaos", type: "number", min: 0, max: 1, step: 0.01, default: 0.3 },
  { key: "hue", label: "Hue", type: "number", min: 0, max: 1, step: 0.01, default: 0.55 },
];

function d(
  pieceId: string,
  generate: RendererKind,
  animate: RendererKind | null,
  react: RendererKind | null,
  opts: Partial<PieceRuntimeDescriptor> & { paramSchema?: ParamField[] } = {},
): PieceRuntimeDescriptor {
  return {
    pieceId,
    generate,
    animate,
    react,
    seedSensitive: opts.seedSensitive ?? true,
    seedAffectsStructure: opts.seedAffectsStructure ?? true,
    paramSchema: opts.paramSchema ?? META,
  };
}

const GEOM_SCHEMA: ParamField[] = [
  ...META,
  { key: "geom.radius", label: "Radius", type: "number", min: 0.4, max: 2, step: 0.05, default: 1 },
  { key: "geom.levels", label: "Layers", type: "number", min: 1, max: 5, step: 1, default: 2 },
  { key: "geom.rotation", label: "Rotation", type: "number", min: 0, max: 6.28, step: 0.01, default: 0 },
];

const RD_SCHEMA: ParamField[] = [
  { key: "f", label: "Feed", type: "number", min: 0.01, max: 0.1, step: 0.001, default: 0.055 },
  { key: "k", label: "Kill", type: "number", min: 0.04, max: 0.08, step: 0.001, default: 0.062 },
  { key: "iterations", label: "Iterations", type: "number", min: 50, max: 2500, step: 10, default: 400 },
  ...META,
];

const ATTRACTOR_SCHEMA: ParamField[] = [
  {
    key: "attractor_type",
    label: "Family",
    type: "choice",
    choices: ["lorenz", "rossler", "clifford"],
    default: "clifford",
  },
  { key: "steps", label: "Steps", type: "number", min: 20000, max: 300000, step: 1000, default: 80000 },
  { key: "ink", label: "Ink", type: "number", min: 0.5, max: 2.5, step: 0.05, default: 1.4 },
  {
    key: "framing",
    label: "Framing",
    type: "choice",
    choices: ["fit", "center", "fixed"],
    default: "fit",
  },
  {
    key: "paper_style",
    label: "Paper",
    type: "choice",
    choices: ["dark", "warm-paper", "white-ink", "plotter"],
    default: "dark",
  },
  ...META,
];

const FLOW_SCHEMA: ParamField[] = [
  { key: "field_scale", label: "Field scale", type: "number", min: 0.008, max: 0.06, step: 0.001, default: 0.02 },
  { key: "line_spacing", label: "Spacing", type: "number", min: 2, max: 12, step: 0.5, default: 4 },
  { key: "streamline_steps", label: "Steps", type: "number", min: 8, max: 40, step: 1, default: 20 },
  { key: "density", label: "Density", type: "number", min: 0.2, max: 1.5, step: 0.05, default: 1 },
  {
    key: "paper_style",
    label: "Paper",
    type: "choice",
    choices: ["dark", "warm-paper", "plotter"],
    default: "warm-paper",
  },
];

const SLIME_SCHEMA: ParamField[] = [
  { key: "steps", label: "Steps", type: "number", min: 50, max: 800, step: 10, default: 200 },
  { key: "density", label: "Density", type: "number", min: 0.2, max: 1.2, step: 0.05, default: 0.7 },
  { key: "chaos", label: "Chaos", type: "number", min: 0, max: 1, step: 0.01, default: 0.3 },
  { key: "hue", label: "Hue", type: "number", min: 0, max: 1, step: 0.01, default: 0.42 },
];

const ESCAPE_SCHEMA: ParamField[] = [
  { key: "zoom", label: "Zoom", type: "number", min: 0.3, max: 8, step: 0.05, default: 1 },
  { key: "iterations", label: "Iterations", type: "number", min: 32, max: 512, step: 8, default: 128 },
  { key: "power", label: "Power", type: "number", min: 2, max: 8, step: 0.1, default: 2 },
  {
    key: "palette",
    label: "Palette",
    type: "choice",
    choices: ["ink", "ocean", "fire", "aurora", "high-contrast"],
    default: "ink",
  },
];

const VORONOI_SCHEMA: ParamField[] = [
  { key: "num_points", label: "Sites", type: "number", min: 20, max: 200, step: 1, default: 50 },
  { key: "edge_width", label: "Edge width", type: "number", min: 0.5, max: 4, step: 0.1, default: 2 },
  { key: "bloom_intensity", label: "Bloom", type: "number", min: 0, max: 0.4, step: 0.01, default: 0.12 },
  ...META,
];

/** Complete catalog — every visible piece declares real capabilities. */
export const PIECE_RUNTIMES: Record<string, PieceRuntimeDescriptor> = {
  "geometry/metatron": d("geometry/metatron", "python-api", "geometry-ir", "geometry-ir", {
    paramSchema: GEOM_SCHEMA,
  }),
  "geometry/seed-of-life": d("geometry/seed-of-life", "python-api", "geometry-ir", "geometry-ir", {
    paramSchema: GEOM_SCHEMA,
  }),
  "geometry/flower-of-life": d("geometry/flower-of-life", "python-api", "geometry-ir", "geometry-ir", {
    paramSchema: GEOM_SCHEMA,
  }),
  "geometry/sri-yantra": d("geometry/sri-yantra", "python-api", "geometry-ir", "geometry-ir", {
    paramSchema: GEOM_SCHEMA,
  }),
  "geometry/isometric": d("geometry/isometric", "python-api", "geometry-ir", "geometry-ir", {
    paramSchema: GEOM_SCHEMA,
  }),
  "geometry/circle-packing": d("geometry/circle-packing", "python-api", "geometry-ir", "geometry-ir", {
    paramSchema: [
      { key: "count", label: "Circles", type: "number", min: 20, max: 200, step: 1, default: 80 },
      ...META,
    ],
  }),
  "reference/circle-lattice": d("reference/circle-lattice", "python-api", "geometry-ir", "geometry-ir", {
    paramSchema: GEOM_SCHEMA,
  }),

  "fields/flow-hatching": d("fields/flow-hatching", "python-api", "shader-native", null, {
    paramSchema: FLOW_SCHEMA,
  }),
  "fields/nebula": d("fields/nebula", "python-api", "shader-native", null, { paramSchema: META }),
  "landscape/noise-landscape": d("landscape/noise-landscape", "python-api", "shader-native", null, {
    paramSchema: [
      {
        key: "overlay",
        label: "Overlay",
        type: "choice",
        choices: ["", "bezier", "concentric", "rects"],
        default: "",
      },
      ...META,
    ],
  }),
  "reference/noise-landscape": d("reference/noise-landscape", "python-api", "shader-native", null),

  "fractals/escape-time": d("fractals/escape-time", "python-api", "shader-native", null, {
    paramSchema: ESCAPE_SCHEMA,
  }),
  "reference/escape-time": d("reference/escape-time", "python-api", "shader-native", null, {
    paramSchema: ESCAPE_SCHEMA,
  }),
  "fractals/strange-attractors": d("fractals/strange-attractors", "python-api", "shader-native", null, {
    paramSchema: ATTRACTOR_SCHEMA,
  }),
  "fractals/sdf-raymarch2d": d("fractals/sdf-raymarch2d", "python-api", "shader-native", null),

  "growth/differential-growth": d(
    "growth/differential-growth",
    "python-api",
    "webgl-stateful",
    "webgl-stateful",
    { paramSchema: [{ key: "growth_rate", label: "Growth", type: "number", min: 0.2, max: 2, step: 0.05, default: 1 }, ...META] },
  ),
  "growth/lsystem": d("growth/lsystem", "python-api", "shader-native", null),
  "growth/slime-mold": d("growth/slime-mold", "python-api", "webgl-stateful", "webgl-stateful", {
    paramSchema: SLIME_SCHEMA,
  }),

  "particles/noodles": d("particles/noodles", "python-api", "webgl-stateful", "webgl-stateful", {
    paramSchema: [
      { key: "flow", label: "Flow", type: "number", min: 0.3, max: 2, step: 0.05, default: 1.2 },
      { key: "curl", label: "Curl", type: "number", min: 0.3, max: 2, step: 0.05, default: 1 },
      ...META,
    ],
  }),

  "reaction-diffusion/reaction-diffusion": d(
    "reaction-diffusion/reaction-diffusion",
    "python-api",
    "webgl-stateful",
    "webgl-stateful",
    { paramSchema: RD_SCHEMA },
  ),

  "tiling/truchet-tiles": d("tiling/truchet-tiles", "python-api", "shader-native", null),
  "tiling/voronoi-stained-glass": d("tiling/voronoi-stained-glass", "python-api", "shader-native", null, {
    paramSchema: VORONOI_SCHEMA,
  }),

  "audiovisual/nodes": d("audiovisual/nodes", "unsupported", "shader-native", "shader-native", {
    seedAffectsStructure: true,
  }),
  "reference/audiovisual-nodes": d(
    "reference/audiovisual-nodes",
    "unsupported",
    "shader-native",
    "shader-native",
  ),

  // Mashups: ANIMATE unsupported until component-composed live runtimes exist.
  "mashups/attractor-calligraphy": d("mashups/attractor-calligraphy", "python-api", null, null),
  "mashups/bureaucratic-growth-forms": d(
    "mashups/bureaucratic-growth-forms",
    "python-api",
    null,
    null,
  ),
  "mashups/cosmic-venation-tiles": d("mashups/cosmic-venation-tiles", "python-api", null, null),
  "mashups/ritual-diagrams": d("mashups/ritual-diagrams", "python-api", null, null),
  "mashups/slime-on-sdf": d("mashups/slime-on-sdf", "python-api", "webgl-stateful", "webgl-stateful"),
  "mashups/striped-worms-eating-boxes": d(
    "mashups/striped-worms-eating-boxes",
    "python-api",
    null,
    null,
  ),

  "flagship/latticefall": d("flagship/latticefall", "wasm", "wasm", "wasm"),
};

export function getPieceRuntime(pieceId: string): PieceRuntimeDescriptor {
  const found = PIECE_RUNTIMES[pieceId];
  if (found) return found;
  return d(pieceId, "unsupported", null, null, {
    seedSensitive: false,
    seedAffectsStructure: false,
  });
}

export function defaultsForPiece(pieceId: string): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  for (const f of getPieceRuntime(pieceId).paramSchema) {
    out[f.key] = f.default;
  }
  return out;
}

export function supportsMode(
  pieceId: string,
  mode: "generate" | "animate" | "react",
): boolean {
  const r = getPieceRuntime(pieceId);
  const kind = mode === "generate" ? r.generate : mode === "animate" ? r.animate : r.react;
  return kind !== null && kind !== "unsupported";
}

/** Pieces allowed to use createShaderPiece — explicit only. */
export const SHADER_NATIVE_PIECES = new Set<string>([
  "audiovisual/nodes",
  "reference/audiovisual-nodes",
  "fractals/escape-time",
  "reference/escape-time",
  "fractals/sdf-raymarch2d",
  "fractals/strange-attractors",
  "fields/flow-hatching",
  "fields/nebula",
  "landscape/noise-landscape",
  "reference/noise-landscape",
  "tiling/truchet-tiles",
  "tiling/voronoi-stained-glass",
  "growth/lsystem",
]);
