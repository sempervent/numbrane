/**
 * Studio UI navigation — matches human Piece Browser + modebar flow.
 */

import type { Page } from "@playwright/test";

export type BrowserCatalogPiece = {
  piece_id: string;
  title?: string;
  name?: string;
};

export async function fetchBrowserCatalog(baseURL: string): Promise<BrowserCatalogPiece[]> {
  const res = await fetch(`${baseURL}/catalog/pieces.json`);
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
  const data = (await res.json()) as { pieces: BrowserCatalogPiece[] };
  return (data.pieces ?? []).sort((a, b) => a.piece_id.localeCompare(b.piece_id));
}

export async function openStudioHome(page: Page): Promise<void> {
  await page.goto("/studio.html", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(
    () => !!(window as unknown as { __NUMBRANE_STUDIO__?: unknown }).__NUMBRANE_STUDIO__,
    null,
    { timeout: 45_000 },
  );
  await page.evaluate(() => {
    (
      window as unknown as { __NUMBRANE_STUDIO__?: { showChromeForTest?: (b?: boolean) => void } }
    ).__NUMBRANE_STUDIO__?.showChromeForTest?.(false);
  });
}

export async function openPieceBrowser(page: Page): Promise<void> {
  await page.evaluate(() => {
    (
      window as unknown as { __NUMBRANE_STUDIO__?: { showChromeForTest?: (b?: boolean) => void } }
    ).__NUMBRANE_STUDIO__?.showChromeForTest?.(true);
  });
  await page.waitForSelector("#browser.visible", { timeout: 10_000 });
}

export async function selectPieceInBrowser(page: Page, pieceId: string): Promise<void> {
  await openPieceBrowser(page);
  const card = page.locator(`#browser .piece[data-piece-id="${pieceId}"]`);
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await page.waitForFunction(
    (id) => (window as unknown as { __NUMBRANE_STUDIO__?: { pieceId?: string } }).__NUMBRANE_STUDIO__?.pieceId === id,
    pieceId,
    { timeout: 15_000 },
  );
}

export async function clickStudioMode(page: Page, mode: "generate" | "animate" | "react"): Promise<void> {
  const btn = page.locator(`#modebar button[data-mode="${mode}"]`);
  await btn.click();
  await page.waitForFunction(
    (m) => (window as unknown as { __NUMBRANE_STUDIO__?: { mode?: string } }).__NUMBRANE_STUDIO__?.mode === m,
    mode,
    { timeout: 10_000 },
  );
}

export async function enterAnimateViaUi(page: Page, pieceId: string): Promise<void> {
  await openStudioHome(page);
  await selectPieceInBrowser(page, pieceId);
  await clickStudioMode(page, "animate");
}

export async function enterGenerateViaUi(page: Page, pieceId: string): Promise<void> {
  await openStudioHome(page);
  await selectPieceInBrowser(page, pieceId);
  await clickStudioMode(page, "generate");
}

export async function failureBannerText(page: Page): Promise<string | null> {
  const visible = await page.locator("#unsupported-banner.visible").count();
  if (!visible) return null;
  return page.locator("#unsupported-banner").textContent();
}

export async function unsupportedBannerText(page: Page): Promise<string | null> {
  const visible = await page.locator("#unsupported-banner.visible").count();
  if (!visible) return null;
  return page.locator("#unsupported-banner").textContent();
}

export async function studioPieceState(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const app = (window as unknown as {
      __NUMBRANE_STUDIO__?: {
        pieceId?: string;
        mode?: string;
        unsupportedMessage?: string;
        getAnimationDiagnostics?: () => Record<string, unknown>;
        descriptorFor?: (id?: string) => unknown;
      };
    }).__NUMBRANE_STUDIO__;
    const diag = app?.getAnimationDiagnostics?.() ?? {};
    return {
      pieceId: app?.pieceId,
      mode: app?.mode,
      unsupportedMessage: app?.unsupportedMessage,
      ...diag,
    };
  });
}
