/**
 * Shared helpers for catalog render certification Playwright runs.
 */

import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { execSync } from "node:child_process";
import {
  classifyPixelFrame,
  type RenderHealthClass,
} from "../../src/studio/catalog/renderHealth";
import type { CatalogCertReport, CatalogCertRow } from "../../src/studio/catalog/certificationTypes";
import {
  effectiveGenerateKind,
  getPieceRuntime,
  resolveGeneratePolicy,
} from "../../src/studio/runtime/registry";
import { collectPieceManifests, studioVisibleManifests } from "../../src/studio/catalog/manifestCollection";
import { buildMashupSet, isMashupPiece } from "../../src/studio/mashups";
import {
  frameHasMeaningfulStructure,
  sampleStagePixels,
  studioDiag,
  waitForLiveFrame,
  waitForStudioPresent,
} from "./animationMetrics";
import { clickStudioMode } from "./studioUi";

export function certificationOutDir(): string {
  const root = path.resolve(process.cwd(), "../../tmp/catalog-certification");
  fs.mkdirSync(path.join(root, "screenshots"), { recursive: true });
  return root;
}

export function gitHead(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export function gitBranch(): string {
  try {
    return execSync("git branch --show-current", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export function healthFromPixels(
  px: Awaited<ReturnType<typeof sampleStagePixels>> | null,
): RenderHealthClass {
  if (!px) return "INVALID";
  if (!frameHasMeaningfulStructure(px)) return "BLANK";
  return classifyPixelFrame(px);
}

async function waitGenerateReady(page: Page, timeoutMs = 120_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const app = (window as unknown as {
        __NUMBRANE_STUDIO__?: { mode?: string; generating?: boolean };
      }).__NUMBRANE_STUDIO__;
      if (!app || app.mode !== "generate") return false;
      if (app.generating) return false;
      const canvas = document.getElementById("stage") as HTMLCanvasElement | null;
      return !!canvas && !canvas.classList.contains("hidden-live") && canvas.width > 0;
    },
    null,
    { timeout: timeoutMs },
  );
}

export async function exercisePieceMode(
  page: Page,
  pieceId: string,
  mode: "generate" | "animate",
  seed = 42,
): Promise<{
  health: RenderHealthClass;
  readyMs: number;
  px: Awaited<ReturnType<typeof sampleStagePixels>> | null;
  diag: Awaited<ReturnType<typeof studioDiag>>;
}> {
  const t0 = Date.now();
  await page.goto(
    `/studio.html?mode=${mode}&piece=${encodeURIComponent(pieceId)}&seed=${seed}`,
    { waitUntil: "domcontentloaded", timeout: 30_000 },
  );
  await page.waitForFunction(
    () =>
      (window as unknown as { __NUMBRANE_STUDIO__?: { studioBootComplete?: boolean } })
        .__NUMBRANE_STUDIO__?.studioBootComplete === true,
    null,
    { timeout: 90_000 },
  );

  if (mode === "generate") {
    await waitGenerateReady(page);
    await waitForStudioPresent(page, 90_000).catch(() => null);
  } else {
    await waitForLiveFrame(page, 90_000).catch(() => null);
    await page.waitForTimeout(800);
  }

  const px = await sampleStagePixels(page).catch(() => null);
  const diag = await studioDiag(page);
  const readyMs = Date.now() - t0;
  return { health: healthFromPixels(px), readyMs, px, diag };
}

export async function certifyPiece(
  page: Page,
  pieceId: string,
  outDir: string,
  consoleErrors: string[],
): Promise<CatalogCertRow> {
  const manifest = studioVisibleManifests(collectPieceManifests()).find((m) => m.piece_id === pieceId);
  const rt = getPieceRuntime(pieceId);
  const policy = resolveGeneratePolicy(pieceId);
  const displayName = manifest?.name ?? manifest?.title ?? pieceId;
  const family = pieceId.split("/")[0] ?? "";

  const blockedByChildren: CatalogCertRow["blockedByChildren"] = [];
  if (isMashupPiece(pieceId)) {
    const set = buildMashupSet(pieceId, 42, {});
    for (const layer of set?.scenes[0]?.layers ?? []) {
      const child = await exercisePieceMode(page, layer.piece, "animate", layer.seed ?? 42);
      blockedByChildren.push({ pieceId: layer.piece, health: child.health });
    }
  }

  const gen = await exercisePieceMode(page, pieceId, "generate");
  const genShot = path.join(outDir, "screenshots", `${pieceId.replace(/\//g, "_")}_generate.png`);
  await page.locator("#stage").screenshot({ path: genShot, type: "png" });

  await clickStudioMode(page, "animate");
  await waitForLiveFrame(page, 60_000).catch(() => null);
  await page.waitForTimeout(1200);
  const animPx = await sampleStagePixels(page).catch(() => null);
  const animDiag = await studioDiag(page);
  const animHealth = healthFromPixels(animPx);
  const animShot = path.join(outDir, "screenshots", `${pieceId.replace(/\//g, "_")}_animate.png`);
  await page.locator("#stage").screenshot({ path: animShot, type: "png" });

  let notes = "";
  if (blockedByChildren.some((c) => c.health === "BLANK" || c.health === "INVALID")) {
    notes = "mashup blocked: child not healthy";
  }

  return {
    pieceId,
    displayName,
    family,
    rendererGenerate: effectiveGenerateKind(pieceId),
    rendererAnimate: rt.animate,
    generatePolicy: policy,
    generateHealth: gen.health,
    animateHealth: animHealth,
    generateReadyMs: gen.readyMs,
    animateReadyMs: Date.now(),
    consoleErrors: [...consoleErrors],
    pageErrors: [],
    canvasWidth: gen.diag.canvasWidth ?? 0,
    canvasHeight: gen.diag.canvasHeight ?? 0,
    presentCount: animDiag.presentCount ?? 0,
    alphaCoverage: animPx?.alphaOccupancy ?? gen.px?.alphaOccupancy ?? 0,
    luminanceVariance: animPx?.luminanceVariance ?? gen.px?.luminanceVariance ?? 0,
    occupiedFraction: animPx?.occupiedFraction ?? gen.px?.occupiedFraction ?? 0,
    animationTimeSec: animDiag.animationTimeSec ?? 0,
    screenshotPath: genShot,
    blockedByChildren: blockedByChildren.length ? blockedByChildren : undefined,
    notes,
  };
}

export function writeCertReport(outDir: string, rows: CatalogCertRow[]): CatalogCertReport {
  const totals: Record<RenderHealthClass, number> = {
    PASS: 0,
    DEGRADED: 0,
    BLANK: 0,
    INVALID: 0,
    WRONG_OUTPUT: 0,
    UNSUPPORTED: 0,
  };
  for (const r of rows) {
    totals[r.generateHealth] += 1;
  }
  const report: CatalogCertReport = {
    generatedAt: new Date().toISOString(),
    branch: gitBranch(),
    head: gitHead(),
    totals,
    rows,
  };
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  const md = [
    `# Catalog certification`,
    ``,
    `- branch: ${report.branch}`,
    `- head: ${report.head}`,
    `- generated: ${report.generatedAt}`,
    ``,
    `## Totals (Generate health)`,
    ...Object.entries(totals).map(([k, v]) => `- ${k}: ${v}`),
    ``,
    `| Piece | Generate | Animate | Gen ms | Notes |`,
    `| --- | --- | --- | ---: | --- |`,
    ...rows.map(
      (r) =>
        `| ${r.displayName} | ${r.generateHealth} | ${r.animateHealth} | ${r.generateReadyMs} | ${r.notes} |`,
    ),
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "report.md"), md);
  return report;
}

export function writeContactSheet(outDir: string, rows: CatalogCertRow[]): void {
  const items = rows
    .map((r) => {
      const rel = path.relative(outDir, r.screenshotPath);
      return `<figure><img src="${rel}" width="240"/><figcaption>${r.displayName}<br/>${r.generateHealth} / ${r.animateHealth}</figcaption></figure>`;
    })
    .join("\n");
  fs.writeFileSync(
    path.join(outDir, "generate-contact-sheet.html"),
    `<!doctype html><html><head><meta charset="utf-8"/><title>Catalog contact sheet</title><style>body{font-family:system-ui;background:#111;color:#eee}figure{display:inline-block;margin:8px;vertical-align:top}figcaption{font-size:12px;max-width:240px}</style></head><body><h1>Generate contact sheet</h1>${items}</body></html>`,
  );
}

export function studioVisiblePieceIds(): string[] {
  return studioVisibleManifests(collectPieceManifests())
    .map((m) => m.piece_id)
    .sort();
}
