/**
 * Node/test catalog audit — not imported from browser bundle.
 */

import {
  collectPieceManifests,
  manifestCapabilityFlags,
  studioVisibleManifests,
} from "../catalog/manifestCollection";
import {
  isBrowserNativeAnimate,
  PIECE_RUNTIMES,
} from "../runtime/registry";
import type { CatalogAuditReport } from "./auditTypes";
import { resolveStudioDescriptor } from "./resolve";
import type { StudioPieceDescriptor } from "./resolve";

export type { CatalogAuditReport } from "./auditTypes";

export function resolveAllStudioDescriptors(
  manifests = studioVisibleManifests(collectPieceManifests()),
): StudioPieceDescriptor[] {
  return manifests.map((m) => resolveStudioDescriptor(m));
}

export function auditStudioCatalog(
  manifests = collectPieceManifests(),
  visible = studioVisibleManifests(manifests),
): CatalogAuditReport {
  const catalogIds = new Set(visible.map((m) => m.piece_id));
  const runtimeIds = new Set(Object.keys(PIECE_RUNTIMES));
  const missingRuntime = [...catalogIds].filter((id) => !runtimeIds.has(id)).sort();
  const orphanRuntime = [...runtimeIds].filter((id) => !catalogIds.has(id)).sort();
  const capabilityMismatches: CatalogAuditReport["capabilityMismatches"] = [];
  const nonAnimateCatalog: string[] = [];

  for (const m of visible) {
    const id = m.piece_id;
    const flags = manifestCapabilityFlags(m);
    const rt = PIECE_RUNTIMES[id];
    if (!rt) {
      capabilityMismatches.push({ pieceId: id, reason: "missing runtime descriptor" });
      nonAnimateCatalog.push(id);
      continue;
    }
    const animateOk = isBrowserNativeAnimate(rt.animate);
    if (!animateOk) {
      capabilityMismatches.push({
        pieceId: id,
        reason: `runtime animate backend ${String(rt.animate)} is not browser-native`,
      });
      nonAnimateCatalog.push(id);
    }
    if (flags.manifestAnimate && !animateOk) {
      capabilityMismatches.push({
        pieceId: id,
        reason: "manifest claims animation but runtime animate unsupported",
      });
    }
    if (animateOk && !flags.manifestAnimate) {
      capabilityMismatches.push({
        pieceId: id,
        reason: "runtime supports animate but manifest lacks animation/animated flag",
      });
    }
    if (rt.generate === "unsupported" && flags.manifestGenerate) {
      capabilityMismatches.push({
        pieceId: id,
        reason: "manifest still=true but runtime generate unsupported",
      });
    }
  }

  return {
    catalogEntries: catalogIds.size,
    runtimeDescriptors: runtimeIds.size,
    intersection: [...catalogIds].filter((id) => runtimeIds.has(id)).length,
    missingRuntime,
    orphanRuntime,
    capabilityMismatches,
    nonAnimateCatalog: nonAnimateCatalog.sort(),
  };
}

export function formatCatalogAudit(report: CatalogAuditReport): string {
  const lines = [
    `catalog entries: ${report.catalogEntries}`,
    `runtime descriptors: ${report.runtimeDescriptors}`,
    `intersection: ${report.intersection}`,
    `missing runtime: ${report.missingRuntime.length}`,
    `orphan runtime: ${report.orphanRuntime.length}`,
    `capability mismatches: ${report.capabilityMismatches.length}`,
  ];
  if (report.missingRuntime.length) lines.push(`  missing: ${report.missingRuntime.join(", ")}`);
  if (report.orphanRuntime.length) lines.push(`  orphan: ${report.orphanRuntime.join(", ")}`);
  for (const m of report.capabilityMismatches) {
    lines.push(`  ${m.pieceId}: ${m.reason}`);
  }
  return lines.join("\n");
}
