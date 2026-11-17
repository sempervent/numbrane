/**
 * Compact PFL control dock.
 */

import type { AudioMode } from "./audio";
import { ARTWORK_IDS, artworkDisplayName, type ArtworkId } from "./artworkTypes";

export type PflControlCallbacks = {
  initialSeed?: number;
  initialArtwork?: ArtworkId;
  onArtworkType: (type: ArtworkId) => void;
  onMode: (mode: AudioMode) => void;
  onFile: (file: File) => void;
  onDevice: (deviceId: string) => void;
  onPlayPause: () => void;
  onSeed: () => void;
  onSensitivity: (v: number) => void;
  onFullscreen: () => void;
  onHide: () => void;
};

export function mountControls(
  host: HTMLElement,
  callbacks: PflControlCallbacks,
): {
  setMeter: (v: number) => void;
  setPlaying: (on: boolean) => void;
  setVariationLabel: (seed: number, facet: string, type: ArtworkId) => void;
  setArtworkType: (type: ArtworkId) => void;
} {
  const typeOptions = ARTWORK_IDS.map(
    (id) => `<option value="${id}">${artworkDisplayName(id)}</option>`,
  ).join("");

  host.innerHTML = `
    <h1>PFL · Visualizer</h1>
    <div class="pfl-row">
      <label>Artwork</label>
      <select id="pfl-artwork-type">${typeOptions}</select>
    </div>
    <div class="pfl-row">
      <label>Source</label>
      <select id="pfl-source">
        <option value="demo" selected>Demo</option>
        <option value="file">File</option>
        <option value="input">Input</option>
      </select>
      <input id="pfl-file" type="file" accept="audio/*,.mp3,.wav,.m4a" hidden />
      <button type="button" id="pfl-pick-file">Choose file</button>
    </div>
    <div class="pfl-row" id="pfl-device-row" style="display:none">
      <label>Device</label>
      <select id="pfl-device"></select>
    </div>
    <div class="pfl-row">
      <button type="button" class="primary" id="pfl-play">Play</button>
      <button type="button" id="pfl-seed">New variation</button>
      <label>Gain</label>
      <input id="pfl-sens" type="range" min="0.3" max="2" step="0.05" value="1" />
      <span id="pfl-meter"><span></span></span>
    </div>
    <div class="pfl-row">
      <button type="button" id="pfl-fullscreen">Fullscreen</button>
      <button type="button" id="pfl-hide">Hide (H)</button>
    </div>
      <p id="pfl-variation" class="pfl-hint">Variation · seed ${callbacks.initialSeed ?? "?"}</p>
    <p class="pfl-hint">Hide controls for OBS · Press H to toggle · Demo runs without permission.</p>
  `;

  const meterBar = host.querySelector<HTMLSpanElement>("#pfl-meter span")!;
  const playBtn = host.querySelector<HTMLButtonElement>("#pfl-play")!;
  const typeSel = host.querySelector<HTMLSelectElement>("#pfl-artwork-type")!;
  if (callbacks.initialArtwork) typeSel.value = callbacks.initialArtwork;

  typeSel.addEventListener("change", () => {
    callbacks.onArtworkType(typeSel.value as ArtworkId);
  });

  host.querySelector("#pfl-source")?.addEventListener("change", (e) => {
    callbacks.onMode((e.target as HTMLSelectElement).value as AudioMode);
    const row = host.querySelector<HTMLDivElement>("#pfl-device-row");
    if (row) row.style.display = (e.target as HTMLSelectElement).value === "input" ? "flex" : "none";
  });
  host.querySelector("#pfl-pick-file")?.addEventListener("click", () => {
    host.querySelector<HTMLInputElement>("#pfl-file")?.click();
  });
  host.querySelector("#pfl-file")?.addEventListener("change", (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) callbacks.onFile(f);
  });
  host.querySelector("#pfl-device")?.addEventListener("change", (e) => {
    callbacks.onDevice((e.target as HTMLSelectElement).value);
  });
  host.querySelector("#pfl-play")?.addEventListener("click", () => callbacks.onPlayPause());
  host.querySelector("#pfl-seed")?.addEventListener("click", () => callbacks.onSeed());
  host.querySelector("#pfl-sens")?.addEventListener("input", (e) => {
    callbacks.onSensitivity(Number((e.target as HTMLInputElement).value));
  });
  host.querySelector("#pfl-fullscreen")?.addEventListener("click", () => callbacks.onFullscreen());
  host.querySelector("#pfl-hide")?.addEventListener("click", () => callbacks.onHide());

  const variationEl = host.querySelector<HTMLParagraphElement>("#pfl-variation");

  return {
    setMeter: (v: number) => {
      meterBar.style.width = `${Math.min(100, Math.max(0, v * 100))}%`;
    },
    setPlaying: (on: boolean) => {
      playBtn.textContent = on ? "Pause" : "Play";
    },
    setVariationLabel: (seed: number, facet: string, type: ArtworkId) => {
      if (variationEl) {
        variationEl.textContent = `${artworkDisplayName(type)} · ${facet} · seed ${seed}`;
      }
    },
    setArtworkType: (type: ArtworkId) => {
      typeSel.value = type;
    },
  };
}

export async function fillDeviceSelect(sel: HTMLSelectElement): Promise<void> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter((d) => d.kind === "audioinput");
  sel.innerHTML = inputs
    .map((d, i) => `<option value="${d.deviceId}">${d.label || `Input ${i + 1}`}</option>`)
    .join("");
}
