/** Circle-lattice reference piece — geometry IR generator. */

export type Recipe = {
  seed?: number;
  parameters?: Record<string, number | string | boolean>;
};

export type GeometryIR = {
  protocol_version: string;
  space: string;
  primitives: Array<Record<string, unknown>>;
};

export function hexCircleCenters(
  rings: number,
  radius: number,
  rotationRad: number,
): Array<[number, number]> {
  const centers: Array<[number, number]> = [[0, 0]];
  const n = Math.max(rings, 0);
  for (let k = 1; k <= n; k++) {
    for (let i = 0; i < 6; i++) {
      const ang = (i * 60 * Math.PI) / 180 + rotationRad;
      const dist = k * radius;
      centers.push([dist * Math.cos(ang), dist * Math.sin(ang)]);
    }
  }
  return centers;
}

export function generate(recipe: Recipe): GeometryIR {
  const params = recipe.parameters ?? {};
  const radius = Number(params["geom.radius"] ?? 1.0);
  const rings = Number(params["geom.rings"] ?? 1);
  const rotationDeg = Number(params["geom.rotation_deg"] ?? 0.0);
  const rotationRad = (rotationDeg * Math.PI) / 180;
  void (recipe.seed ?? 0);

  const centers = hexCircleCenters(rings, radius, rotationRad);
  return {
    protocol_version: "0.1.0",
    space: "cartesian-2d",
    primitives: centers.map(([cx, cy]) => ({
      kind: "circle",
      cx,
      cy,
      r: radius,
      stroke: "#e8e6e3",
      fill: null,
      stroke_width: 0.02,
    })),
  };
}

export function normalizeGeometry(ir: GeometryIR): GeometryIR {
  const prims = [...ir.primitives].sort((a, b) => {
    const ka = String(a.kind ?? "");
    const kb = String(b.kind ?? "");
    if (ka !== kb) return ka < kb ? -1 : 1;
    const ax = Number(a.cx ?? a.x ?? 0);
    const bx = Number(b.cx ?? b.x ?? 0);
    if (ax !== bx) return ax - bx;
    const ay = Number(a.cy ?? a.y ?? 0);
    const by = Number(b.cy ?? b.y ?? 0);
    if (ay !== by) return ay - by;
    return Number(a.r ?? 0) - Number(b.r ?? 0);
  });
  return {
    protocol_version: ir.protocol_version,
    space: ir.space,
    primitives: prims,
  };
}
