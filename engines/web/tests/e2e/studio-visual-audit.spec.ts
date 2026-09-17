/**
 * Human-first visual catalog audit against the real Docker Studio.
 *
 * This is intentionally evidence-producing rather than an artistic pass/fail gate.
 */

import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import type { PixelFrame } from "../../src/live/pixelMetrics";
import {
  clickStudioMode,
  fetchBrowserCatalog,
  openStudioHome,
  selectPieceInBrowser,
  studioPieceState,
} from "./studioUi";
import {
  frameIsVisible,
  sampleStagePixels,
  waitForStudioPresent,
} from "./animationMetrics";

type Warning = "BLACK" | "STATIC" | "ERROR" | "LOW OCCUPANCY" | "NO FIRST FRAME";

type AuditEntry = {
  pieceId: string;
  title: string;
  slug: string;
  backend: string;
  animationMethod: string;
  secondMethod: string;
  warnings: Warning[];
  consoleErrors: string[];
  frames: Record<string, PixelFrame | null>;
  runtime: Record<string, unknown>;
};

const auditRoot = path.resolve(process.cwd(), "../../artifacts/visual-audit");

function pieceSlug(pieceId: string): string {
  return pieceId.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function html(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function obviousBlack(frame: PixelFrame | null): boolean {
  return !!frame && frame.meanLuminance < 1.5 && frame.luminanceVariance < 2 && frame.occupiedFraction < 0.002;
}

function lowOccupancy(frame: PixelFrame | null): boolean {
  return !!frame && frame.occupiedFraction < 0.01 && frame.meanLuminance < 8;
}

function obviousStatic(frames: Array<PixelFrame | null>): boolean {
  const usable = frames.filter((frame): frame is PixelFrame => !!frame);
  if (usable.length < 3) return false;
  return usable.slice(1).every(
    (frame) => frame.changedPixelFraction < 0.002 && frame.rmsDifference < 1.5,
  );
}

async function captureStage(page: import("@playwright/test").Page, file: string): Promise<void> {
  await page.locator("#stage-wrap").screenshot({ path: file, type: "png" });
}

async function sampleOrNull(page: import("@playwright/test").Page): Promise<PixelFrame | null> {
  return sampleStagePixels(page).catch(() => null);
}

async function setAuditChrome(
  page: import("@playwright/test").Page,
  visible: boolean,
  browserVisible = false,
): Promise<void> {
  await page.evaluate(({ visible, browserVisible }) => {
    const app = (window as unknown as {
      __NUMBRANE_STUDIO__?: {
        controlsVisible: boolean;
        browserVisible: boolean;
        syncChrome: () => void;
        renderBrowser: () => void;
      };
    }).__NUMBRANE_STUDIO__;
    if (!app) return;
    app.controlsVisible = visible;
    app.browserVisible = visible && browserVisible;
    app.syncChrome();
    if (app.browserVisible) app.renderBrowser();
  }, { visible, browserVisible });
}

async function captureAnimationCheckpoint(
  page: import("@playwright/test").Page,
  dir: string,
  seconds: number,
  startedAtMs: number,
): Promise<PixelFrame | null> {
  const remainingMs = seconds * 1_000 - (Date.now() - startedAtMs);
  if (remainingMs > 0) await page.waitForTimeout(remainingMs);
  const frame = await sampleOrNull(page);
  await captureStage(page, path.join(dir, `animate-${seconds}.png`));
  return frame;
}

function writeContactSheet(entries: AuditEntry[]): void {
  const cards = entries.map((entry) => {
    const warningBadges = entry.warnings.length
      ? entry.warnings.map((warning) => `<span class="warning">${html(warning)}</span>`).join("")
      : `<span class="ok">NO OBVIOUS FAILURE</span>`;
    const image = (name: string, label: string) => `
      <figure><img loading="lazy" src="./${entry.slug}/${name}.png" alt="${html(entry.title)} ${label}">
      <figcaption>${label}</figcaption></figure>`;
    return `<article class="card" data-piece="${html(entry.pieceId)}">
      <header><div><h2>${html(entry.title)}</h2><code>${html(entry.pieceId)}</code></div><div>${warningBadges}</div></header>
      <div class="meta">backend: ${html(entry.backend)} · method: ${html(entry.animationMethod)} · alternate: ${html(entry.secondMethod)}</div>
      <div class="frames">
        ${image("generate", "GENERATE")}
        ${image("animate-0", "ANIMATE 0s")}
        ${image("animate-2", "ANIMATE 2s")}
        ${image("animate-5", "ANIMATE 5s")}
        ${image("animate-10", "ANIMATE 10s")}
        ${image("method-2", "METHOD 2")}
      </div>
      <div class="review" data-slug="${entry.slug}">
        <span>Human label:</span>
        ${["GOOD", "PROMISING", "BROKEN", "BORING"].map((label) => `<button type="button" data-label="${label}">${label}</button>`).join("")}
        <a href="./${entry.slug}/console.txt">console</a>
        <a href="./${entry.slug}/metrics.json">metrics</a>
      </div>
      ${entry.consoleErrors.length ? `<pre>${html(entry.consoleErrors.join("\n"))}</pre>` : ""}
    </article>`;
  }).join("\n");

  fs.writeFileSync(path.join(auditRoot, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NUMBRANE Studio visual audit</title><style>
:root{color-scheme:dark;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#080a0f;color:#edf2f7}
body{margin:0;padding:24px}h1{margin:0 0 8px}.lede{color:#9aa6b8;max-width:90ch}.counts{position:sticky;top:0;z-index:5;background:#080a0fdd;padding:12px 0;border-bottom:1px solid #273244}
.card{margin:22px 0;padding:16px;border:1px solid #273244;border-radius:12px;background:#0d1119}.card header{display:flex;justify-content:space-between;gap:16px;align-items:start}.card h2{margin:0 0 4px}.meta,code,figcaption{color:#9aa6b8}.frames{display:grid;grid-template-columns:repeat(6,minmax(180px,1fr));gap:8px;margin-top:14px;overflow-x:auto}.frames figure{margin:0}.frames img{width:100%;aspect-ratio:16/10;object-fit:cover;background:#000;border:1px solid #273244}.frames figcaption{padding-top:4px}.warning,.ok{display:inline-block;margin:2px;padding:4px 7px;border-radius:999px;font-size:11px}.warning{color:#fecaca;background:#7f1d1d}.ok{color:#bbf7d0;background:#14532d}.review{display:flex;gap:8px;align-items:center;margin-top:14px}.review button,.review a{color:#dbeafe;background:#172033;border:1px solid #34435d;padding:5px 8px;border-radius:5px;text-decoration:none}.review button.selected{outline:2px solid #7dd3fc}pre{white-space:pre-wrap;color:#fca5a5}
@media(max-width:1000px){.frames{grid-template-columns:repeat(3,minmax(180px,1fr))}}
</style></head><body>
<h1>NUMBRANE Studio visual audit</h1><p class="lede">Decoded framebuffer heuristics only flag obvious technical failures. Artistic quality is a human decision. Labels stay in this browser's local storage and are never uploaded.</p>
<div class="counts" id="counts"></div>${cards}
<script>
const key='numbrane.visualAudit.labels.v1';
let labels={};try{labels=JSON.parse(localStorage.getItem(key)||'{}')}catch{}
const kinds=['GOOD','PROMISING','BROKEN','BORING'];
function paint(){const c=Object.fromEntries(kinds.map(k=>[k,0]));let unclassified=0;
 document.querySelectorAll('.review').forEach(row=>{const slug=row.dataset.slug;const value=labels[slug];if(value)c[value]++;else unclassified++;
  row.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b.dataset.label===value));});
 document.querySelector('#counts').textContent=kinds.map(k=>k+': '+c[k]).join(' · ')+' · UNCLASSIFIED: '+unclassified;}
document.addEventListener('click',e=>{const b=e.target.closest('.review button');if(!b)return;const row=b.closest('.review');labels[row.dataset.slug]=b.dataset.label;try{localStorage.setItem(key,JSON.stringify(labels))}catch{}paint()});paint();
</script></body></html>`);
}

test("audit every visible Studio catalog piece", async ({ page, baseURL }) => {
  fs.rmSync(auditRoot, { recursive: true, force: true });
  fs.mkdirSync(auditRoot, { recursive: true });

  const catalog = await fetchBrowserCatalog(baseURL!);
  const entries: AuditEntry[] = [];
  let activePiece = "boot";
  const consoleByPiece = new Map<string, string[]>();
  const record = (line: string) => {
    const lines = consoleByPiece.get(activePiece) ?? [];
    lines.push(line);
    consoleByPiece.set(activePiece, lines);
  };
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") record(`[${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => record(`[pageerror] ${err.message}`));

  await openStudioHome(page);

  for (const piece of catalog) {
    activePiece = piece.piece_id;
    consoleByPiece.set(activePiece, []);
    const slug = pieceSlug(activePiece);
    const dir = path.join(auditRoot, slug);
    fs.mkdirSync(dir, { recursive: true });
    const frames: Record<string, PixelFrame | null> = {};
    const warnings = new Set<Warning>();
    let runtime: Record<string, unknown> = {};
    let backend = "unknown";
    let animationMethod = "unknown";
    let secondMethod = "unavailable";

    try {
      await setAuditChrome(page, true);
      await clickStudioMode(page, "generate");
      await selectPieceInBrowser(page, activePiece);
      await setAuditChrome(page, false);
      await waitForStudioPresent(page, 45_000);
      frames.generate = await sampleOrNull(page);
      await captureStage(page, path.join(dir, "generate.png"));

      await setAuditChrome(page, true);
      await clickStudioMode(page, "animate");
      await setAuditChrome(page, false);
      try {
        await waitForStudioPresent(page, 15_000);
      } catch {
        warnings.add("NO FIRST FRAME");
      }
      const animateStartedAtMs = Date.now();
      frames["animate-0"] = await captureAnimationCheckpoint(page, dir, 0, animateStartedAtMs);
      frames["animate-2"] = await captureAnimationCheckpoint(page, dir, 2, animateStartedAtMs);
      frames["animate-5"] = await captureAnimationCheckpoint(page, dir, 5, animateStartedAtMs);
      frames["animate-10"] = await captureAnimationCheckpoint(page, dir, 10, animateStartedAtMs);

      runtime = await studioPieceState(page);
      backend = String(runtime.backend ?? runtime.animBackend ?? "unknown");
      animationMethod = String(runtime.animationMethodId ?? "unknown");

      await setAuditChrome(page, true);
      const methodSelect = page.getByLabel("Animation method");
      const options = await methodSelect.locator("option").evaluateAll((nodes) =>
        nodes.map((node) => ({ value: (node as HTMLOptionElement).value, text: node.textContent ?? "" })),
      );
      const alternate = options.find((option) => option.value !== animationMethod && option.value !== "random");
      if (alternate) {
        secondMethod = alternate.value;
        await methodSelect.selectOption(alternate.value);
        await page.waitForFunction(
          (id) => (window as unknown as { __NUMBRANE_STUDIO__?: { activeAnimationMethodId?: string } }).__NUMBRANE_STUDIO__?.activeAnimationMethodId === id,
          alternate.value,
          { timeout: 10_000 },
        );
        await page.waitForTimeout(1_000);
      }
      await setAuditChrome(page, false);
      frames["method-2"] = await sampleOrNull(page);
      await captureStage(page, path.join(dir, "method-2.png"));
    } catch (err) {
      warnings.add("ERROR");
      record(`[audit] ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
      for (const name of ["generate", "animate-0", "animate-2", "animate-5", "animate-10", "method-2"]) {
        const file = path.join(dir, `${name}.png`);
        if (!fs.existsSync(file)) await captureStage(page, file).catch(() => undefined);
      }
      runtime = await studioPieceState(page).catch(() => ({}));
      backend = String(runtime.backend ?? runtime.animBackend ?? "unknown");
      animationMethod = String(runtime.animationMethodId ?? "unknown");
    }

    const consoleErrors = consoleByPiece.get(activePiece) ?? [];
    if (consoleErrors.length > 0 || runtime.unsupportedMessage) warnings.add("ERROR");
    if (Object.values(frames).some(obviousBlack)) warnings.add("BLACK");
    if (Object.values(frames).some(lowOccupancy)) warnings.add("LOW OCCUPANCY");
    if (obviousStatic([frames["animate-0"] ?? null, frames["animate-2"] ?? null, frames["animate-5"] ?? null, frames["animate-10"] ?? null])) warnings.add("STATIC");
    if (!frames["animate-0"] || !frameIsVisible(frames["animate-0"]!)) warnings.add("NO FIRST FRAME");

    const entry: AuditEntry = {
      pieceId: activePiece,
      title: piece.title ?? piece.name ?? activePiece,
      slug,
      backend,
      animationMethod,
      secondMethod,
      warnings: [...warnings].sort(),
      consoleErrors,
      frames,
      runtime,
    };
    entries.push(entry);
    fs.writeFileSync(path.join(dir, "console.txt"), consoleErrors.join("\n"));
    fs.writeFileSync(path.join(dir, "metrics.json"), JSON.stringify(entry, null, 2));
  }

  const warningCounts: Record<string, number> = {};
  for (const entry of entries) {
    for (const warning of entry.warnings) warningCounts[warning] = (warningCounts[warning] ?? 0) + 1;
  }
  fs.writeFileSync(path.join(auditRoot, "summary.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    studioUrl: baseURL,
    catalogCount: entries.length,
    warningCounts,
    humanQuality: { GOOD: 0, PROMISING: 0, BROKEN: 0, BORING: 0, UNCLASSIFIED: entries.length },
    pieces: entries,
  }, null, 2));
  writeContactSheet(entries);
});
