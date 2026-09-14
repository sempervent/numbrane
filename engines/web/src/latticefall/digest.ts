/**
 * Deterministic semantic state digest for LATTICEFALL.
 * Quantizes floats then FNV-1a 64 (hex). Not a screenshot hash.
 */

import type { PhaseSnapshot } from "./phases";
import type { LatticefallTelemetry } from "./telemetry";
import type { MusicalEvent } from "./music";

function quantize(x: number, scale = 1e6): number {
  return Math.round(x * scale);
}

function fnv1a64Hex(parts: string[]): string {
  // 64-bit FNV-1a via BigInt
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const enc = new TextEncoder();
  for (const part of parts) {
    const bytes = enc.encode(part);
    for (let i = 0; i < bytes.length; i++) {
      h ^= BigInt(bytes[i]!);
      h = (h * prime) & 0xffff_ffff_ffff_ffffn;
    }
    h ^= 0x7en; // '|'
    h = (h * prime) & 0xffff_ffff_ffff_ffffn;
  }
  return h.toString(16).padStart(16, "0");
}

export type DigestInput = {
  frame: number;
  seed: number;
  particleDigest: string;
  phase: PhaseSnapshot;
  telemetry: LatticefallTelemetry;
  musicEvents: MusicalEvent[];
  chaos: number;
  fieldStrength: number;
  latticeGravity: number;
};

export function semanticDigest(input: DigestInput): string {
  const musicCanon = input.musicEvents
    .map(
      (e) =>
        `${e.frame}:${e.midi}:${quantize(e.velocity, 1e4)}:${e.voice}`,
    )
    .join(",");
  return fnv1a64Hex([
    `f=${input.frame}`,
    `s=${input.seed >>> 0}`,
    `pd=${input.particleDigest}`,
    `ph=${input.phase.name}:${quantize(input.phase.progress)}`,
    `ge=${quantize(input.phase.geometryClarity)}`,
    `fp=${quantize(input.phase.fractalPressure)}`,
    `te=${quantize(input.telemetry.energy)}`,
    `tt=${quantize(input.telemetry.texture)}`,
    `tm=${quantize(input.telemetry.motion)}`,
    `ts=${quantize(input.telemetry.spectral)}`,
    `mu=${musicCanon}`,
    `ch=${quantize(input.chaos)}`,
    `fs=${quantize(input.fieldStrength)}`,
    `lg=${quantize(input.latticeGravity)}`,
  ]);
}
