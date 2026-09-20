import { test, expect } from "@playwright/test";
import { waitForStudioBoot } from "./studioUi";

const SPOT_CHECK = [
  "fractals/sdf-raymarch2d",
  "reaction-diffusion/reaction-diffusion",
  "flagship/latticefall",
  "geometry/metatron",
  "fractals/escape-time",
  "geometry/flower-of-life",
  "geometry/sri-yantra",
  "fractals/strange-attractors",
  "growth/slime-mold",
  "growth/differential-growth",
];

test.describe("Performance browser previews", () => {
  test("curated cards leave preview loading state", async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto("/studio.html?mode=animate&piece=fractals/strange-attractors&seed=42", {
      waitUntil: "domcontentloaded",
    });
    await waitForStudioBoot(page);
    await page.evaluate(() => {
      (window as unknown as { __NUMBRANE_STUDIO__?: { setBrowserVisible?: (v: boolean) => void } })
        .__NUMBRANE_STUDIO__?.setBrowserVisible?.(true);
    });

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const stats = (
              window as unknown as {
                __NUMBRANE_STUDIO__?: {
                  browserThumbStats?: {
                    inFlight: number;
                    requested: number;
                    loaded: number;
                    liveOnly: number;
                    failed: number;
                    stillLoading?: number;
                  };
                };
              }
            ).__NUMBRANE_STUDIO__?.browserThumbStats;
            if (!stats) return "no-stats";
            if (stats.inFlight > 0) return "in-flight";
            if (typeof stats.stillLoading === "number" && stats.stillLoading > 0) return "waiting";
            const settled = stats.loaded + stats.liveOnly + stats.failed;
            if (stats.requested === 0) return settled > 0 ? "ok" : "waiting";
            return settled >= stats.requested ? "ok" : "waiting";
          }),
        { timeout: 180_000 },
      )
      .toBe("ok");

    await expect
      .poll(
        async () => {
          return page.evaluate((ids) => {
            let stuck = 0;
            const detail: string[] = [];
            for (const pieceId of ids) {
              const card = document.querySelector(`#browser .piece[data-piece-id="${pieceId}"]`);
              if (!card) {
                stuck += 1;
                detail.push(`${pieceId}:missing`);
                continue;
              }
              const img = card.querySelector("img.thumb") as HTMLImageElement | null;
              const ph = (card.querySelector(".thumb-placeholder")?.textContent ?? "").trim();
              const imgLoaded = img?.dataset.loaded === "1";
              const settled =
                imgLoaded ||
                ph.includes("HOVER") ||
                ph.includes("MOTION") ||
                ph.includes("FAILED");
              if (!settled) {
                stuck += 1;
                detail.push(`${pieceId}:${ph || "no-placeholder"}`);
              }
            }
            return { stuck, detail };
          }, SPOT_CHECK);
        },
        { timeout: 60_000 },
      )
      .toMatchObject({ stuck: 0 });

    const stats = await page.evaluate(() => {
      return (window as unknown as { __NUMBRANE_STUDIO__?: { browserThumbStats?: unknown } })
        .__NUMBRANE_STUDIO__?.browserThumbStats;
    });
    expect(stats).toBeTruthy();
    expect(
      (stats as { stillLoading?: number }).stillLoading ?? 0,
      "still-loading after queue settled",
    ).toBe(0);
  });
});
