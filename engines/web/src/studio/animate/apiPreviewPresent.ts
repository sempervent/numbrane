/**
 * Present api-preview stills with camera pan/zoom (matches live_camera.frag UV math).
 */

import type { CameraView } from "../animation/spec";
import { analyzeRgbaGrid, type PixelFrame } from "../../live/pixelMetrics";

function mirror01(c: number): number {
  const m = ((c % 2) + 2) % 2;
  return m < 1 ? m : 2 - m;
}

export function cameraTexUv(uvx: number, uvy: number, cam: CameraView): [number, number] {
  let px = uvx - 0.5;
  let py = uvy - 0.5;
  const cs = Math.cos(cam.rotation);
  const sn = Math.sin(cam.rotation);
  const rx = cs * px - sn * py;
  const ry = sn * px + cs * py;
  px = rx / Math.max(0.05, cam.scale);
  py = ry / Math.max(0.05, cam.scale);
  return [px + cam.centerX + 0.5, py + cam.centerY + 0.5];
}

function sampleBilinear(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  u: number,
  v: number,
): [number, number, number, number] {
  const x = u * (w - 1);
  const y = (1 - v) * (h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const i00 = (y0 * w + x0) * 4;
  const i10 = (y0 * w + x1) * 4;
  const i01 = (y1 * w + x0) * 4;
  const i11 = (y1 * w + x1) * 4;
  const out: [number, number, number, number] = [0, 0, 0, 255];
  for (let c = 0; c < 4; c++) {
    const v00 = data[i00 + c]!;
    const v10 = data[i10 + c]!;
    const v01 = data[i01 + c]!;
    const v11 = data[i11 + c]!;
    out[c] = Math.round(
      v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) + v01 * (1 - tx) * ty + v11 * tx * ty,
    );
  }
  return out;
}

export function samplePreviewImageGrid(
  img: HTMLImageElement,
  gridW: number,
  gridH: number,
  camera: CameraView,
  prior?: { pixels: Uint8Array; stats: PixelFrame },
): { stats: PixelFrame; grid: Uint8Array } | null {
  if (!img.complete || img.naturalWidth < 1 || img.naturalHeight < 1) return null;
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const scratch = document.createElement("canvas");
  scratch.width = sw;
  scratch.height = sh;
  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const src = ctx.getImageData(0, 0, sw, sh).data;
  const grid = new Uint8Array(gridW * gridH * 4);
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const uvx = (gx + 0.5) / gridW;
      const uvy = (gy + 0.5) / gridH;
      const [tux, tuy] = cameraTexUv(uvx, uvy, camera);
      const di = (gy * gridW + gx) * 4;
      const mux = mirror01(tux);
      const muy = mirror01(tuy);
      const [r, g, b, a] = sampleBilinear(src, sw, sh, mux, muy);
      grid[di] = r;
      grid[di + 1] = g;
      grid[di + 2] = b;
      grid[di + 3] = a;
    }
  }
  return { stats: analyzeRgbaGrid(grid, gridW, gridH, prior), grid };
}

export function applyPreviewCameraStyle(img: HTMLImageElement, camera: CameraView): void {
  const scale = Math.max(0.05, camera.scale);
  img.style.transformOrigin = "center center";
  img.style.transform = `translate(${camera.centerX * 50}%, ${camera.centerY * 50}%) scale(${scale})`;
}
