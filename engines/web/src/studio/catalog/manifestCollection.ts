/**
 * Canonical manifest scan — same source as /catalog/pieces.json (vite catalog plugin).
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PieceCapabilities, PieceInfo } from "../catalog";

export type PieceManifest = PieceInfo & {
  piece_id: string;
  name?: string;
  /** When false, omit from Studio piece browser (reference/test fixtures). */
  studio_visible?: boolean;
};

function findPiecesDir(): string {
  const here = fileURLToPath(import.meta.url);
  const candidates = [
    resolve(here, "../../../../../pieces"),
    resolve(here, "../../../../../../pieces"),
    resolve(process.cwd(), "../../pieces"),
    resolve(process.cwd(), "../pieces"),
    resolve(process.cwd(), "pieces"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  throw new Error("pieces directory not found for catalog collection");
}

let cachedPiecesDir: string | undefined;

/** Recursively collect piece manifests from pieces tree (manifest.json). */
export function collectPieceManifests(piecesDir?: string): PieceManifest[] {
  const root = piecesDir ?? cachedPiecesDir ?? findPiecesDir();
  cachedPiecesDir = root;
  const pieces: PieceManifest[] = [];
  function walk(dir: string): void {
    if (!existsSync(dir)) return;
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name === "manifest.json") {
        try {
          const raw = JSON.parse(readFileSync(p, "utf8")) as PieceManifest;
          if (raw.piece_id) pieces.push(raw);
        } catch {
          /* skip invalid manifest */
        }
      }
    }
  }
  walk(root);
  pieces.sort((a, b) => a.piece_id.localeCompare(b.piece_id));
  return pieces;
}

export function studioVisibleManifests(manifests = collectPieceManifests()): PieceManifest[] {
  return manifests.filter((m) => m.studio_visible !== false);
}

export function manifestCapabilityFlags(m: PieceManifest): {
  manifestAnimate: boolean;
  manifestGenerate: boolean;
  manifestReact: boolean;
} {
  const caps = (m.capabilities ?? {}) as PieceCapabilities & {
    animation?: boolean;
    audio?: boolean;
  };
  return {
    manifestAnimate: !!(caps.animation || caps.animated || caps.realtime),
    manifestGenerate: caps.still !== false,
    manifestReact: !!caps.audio_reactive,
  };
}
