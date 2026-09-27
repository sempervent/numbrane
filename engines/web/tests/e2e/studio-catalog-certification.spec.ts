/**
 * Full catalog certification — writes tmp/catalog-certification/ (run locally or CATALOG_CERT=1).
 */

import { test, expect } from "@playwright/test";
import {
  certificationOutDir,
  certifyPiece,
  studioVisiblePieceIds,
  writeCertReport,
  writeContactSheet,
} from "./catalogCertification";

const runFull = process.env.CATALOG_CERT === "1";

test.describe("catalog certification harness", () => {
  test.skip(!runFull, "set CATALOG_CERT=1 for full catalog iteration");

  test("certify every studio-visible piece", async ({ page }) => {
    test.setTimeout(3_600_000);
    const outDir = certificationOutDir();
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    const ids = studioVisiblePieceIds();
    const rows = [];
    for (const id of ids) {
      rows.push(await certifyPiece(page, id, outDir, consoleErrors));
    }
    const report = writeCertReport(outDir, rows);
    writeContactSheet(outDir, rows);
    expect(report.rows.length).toBe(ids.length);
  });
});
