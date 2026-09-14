/**
 * Default REACT audio mappings per piece family (meaningful algorithm params).
 */

export type AudioMapping = {
  source: string;
  target: string;
  amount: number;
  curve?: "linear" | "ease";
};

export function defaultMappingsForPiece(pieceId: string): AudioMapping[] {
  if (pieceId.includes("reaction-diffusion")) {
    return [
      { source: "energy", target: "density", amount: 0.35 },
      { source: "onset", target: "exposure", amount: 0.5 },
      { source: "low", target: "f", amount: 0.15 },
      { source: "high", target: "k", amount: 0.12 },
    ];
  }
  if (pieceId.includes("slime")) {
    return [
      { source: "low", target: "stepSize", amount: 0.4 },
      { source: "flux", target: "sensorAngle", amount: 0.35 },
      { source: "energy", target: "deposit", amount: 0.45 },
      { source: "high", target: "decay", amount: 0.2 },
    ];
  }
  if (pieceId.includes("attractor")) {
    return [
      { source: "centroid", target: "chaos", amount: 0.4 },
      { source: "onset", target: "density", amount: 0.35 },
      { source: "energy", target: "exposure", amount: 0.3 },
    ];
  }
  if (pieceId.startsWith("geometry/") || pieceId.includes("circle-lattice")) {
    return [
      { source: "onset", target: "density", amount: 0.4 },
      { source: "low", target: "chaos", amount: 0.35 },
      { source: "energy", target: "hue", amount: 0.2 },
    ];
  }
  if (pieceId.includes("escape") || pieceId.includes("fractal")) {
    return [
      { source: "centroid", target: "hue", amount: 0.35 },
      { source: "energy", target: "zoom", amount: 0.25 },
      { source: "high", target: "chaos", amount: 0.3 },
    ];
  }
  if (pieceId.includes("noodle")) {
    return [
      { source: "low", target: "density", amount: 0.4 },
      { source: "high", target: "chaos", amount: 0.35 },
      { source: "energy", target: "exposure", amount: 0.25 },
    ];
  }
  if (pieceId.includes("latticefall")) {
    return [
      { source: "energy", target: "density", amount: 0.4 },
      { source: "low", target: "chaos", amount: 0.3 },
      { source: "onset", target: "exposure", amount: 0.45 },
    ];
  }
  return [
    { source: "energy", target: "density", amount: 0.35 },
    { source: "onset", target: "exposure", amount: 0.4 },
    { source: "low", target: "chaos", amount: 0.25 },
    { source: "high", target: "hue", amount: 0.2 },
  ];
}
