import { describe, expect, it } from "vitest";
import {
  auditStudioCatalog,
  formatCatalogAudit,
  resolveAllStudioDescriptors,
} from "../src/studio/descriptor/catalogAudit";

describe("studio catalog audit", () => {
  it("catalog and runtime registry align with zero gaps", () => {
    const report = auditStudioCatalog();
    if (report.missingRuntime.length || report.orphanRuntime.length || report.capabilityMismatches.length) {
      console.log(formatCatalogAudit(report));
    }
    expect(report.catalogEntries).toBeGreaterThan(0);
    expect(report.missingRuntime, formatCatalogAudit(report)).toEqual([]);
    expect(report.orphanRuntime, formatCatalogAudit(report)).toEqual([]);
    expect(report.capabilityMismatches, formatCatalogAudit(report)).toEqual([]);
    expect(report.nonAnimateCatalog, formatCatalogAudit(report)).toEqual([]);
  });

  it("every visible catalog piece resolves a descriptor with animate supported", () => {
    const descriptors = resolveAllStudioDescriptors();
    expect(descriptors.length).toBeGreaterThan(0);
    for (const d of descriptors) {
      expect(d.animate.supported, `${d.pieceId} animate`).toBe(true);
      expect(d.animate.backend, `${d.pieceId} backend`).not.toBeNull();
    }
  });
});
