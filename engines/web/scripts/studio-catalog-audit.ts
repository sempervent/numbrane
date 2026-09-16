#!/usr/bin/env npx tsx
import { auditStudioCatalog, formatCatalogAudit } from "../src/studio/descriptor/catalogAudit";

const report = auditStudioCatalog();
console.log(formatCatalogAudit(report));
const ok =
  report.missingRuntime.length === 0 &&
  report.orphanRuntime.length === 0 &&
  report.capabilityMismatches.length === 0 &&
  report.nonAnimateCatalog.length === 0 &&
  report.nonGenerateCatalog.length === 0;
process.exit(ok ? 0 : 1);
