/**
 * NUMBRANE LIVE control surface.
 */

import { LiveSession, installSetMidiCues } from "./session";
import type { SetDef, ResolutionPreset, QualityProfile } from "./types";
import type { PerformanceRecording } from "./recording/performance";
import { parseRecording, serializeRecording } from "./recording/performance";

declare global {
  interface Window {
    __NUMBRANE_LIVE__?: {
      session: LiveSession;
      digest: () => string;
      injectFeatures: (f: Record<string, number | boolean>) => void;
      injectMidi: (bytes: number[]) => void;
      exportRecording: () => string | null;
      loadRecording: (json: string) => void;
      gotoScene: (id: string | number) => Promise<void>;
      blackout: (on: boolean) => void;
      panic: () => void;
    };
  }
}

function el(tag: string, attrs: Record<string, string> = {}, text?: string): HTMLElement {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}

async function loadDefaultSet(): Promise<SetDef> {
  const res = await fetch("/sets/pfl-default.json");
  if (!res.ok) throw new Error(`Failed to load set: ${res.status}`);
  return (await res.json()) as SetDef;
}

function qs(): URLSearchParams {
  return new URLSearchParams(location.search);
}

export async function bootLive(opts: {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  outputOnly?: boolean;
}): Promise<LiveSession> {
  const params = qs();
  const outputOnly = opts.outputOnly || params.get("output") === "1";
  const transparent = params.get("alpha") === "1" || params.get("transparent") === "1";
  const session = new LiveSession({
    canvas: opts.canvas,
    outputOnly,
    transparent,
    seed: Number(params.get("seed") ?? 42) >>> 0,
  });
  await session.init();

  const setId = params.get("set") ?? "pfl-default";
  let set: SetDef;
  if (setId === "pfl-default") set = await loadDefaultSet();
  else {
    const res = await fetch(`/sets/${setId}.json`);
    set = (await res.json()) as SetDef;
  }
  await session.loadSet(set);
  installSetMidiCues(session, set);

  const sceneParam = params.get("scene");
  if (sceneParam) await session.gotoScene(sceneParam);

  const resPreset = (params.get("res") as ResolutionPreset) || "1920x1080";
  session.applyResolution(resPreset);

  if (!outputOnly) {
    mountUi(opts.root, session, set, opts.canvas);
  } else {
    opts.root.style.display = "none";
    document.body.style.cursor = "none";
  }

  bindKeys(session);
  session.runtime.transport.start();
  session.startLoop();

  let lastRec: PerformanceRecording | null = null;
  window.__NUMBRANE_LIVE__ = {
    session,
    digest: () => session.semanticDigest(),
    injectFeatures: (f) => {
      session.injectFeatures({
        energy: Number(f.energy ?? 0),
        peak: Number(f.peak ?? 0),
        low: Number(f.low ?? 0),
        mid: Number(f.mid ?? 0),
        high: Number(f.high ?? 0),
        centroid: Number(f.centroid ?? 0),
        flux: Number(f.flux ?? 0),
        onset: Boolean(f.onset),
        rolloff: Number(f.rolloff ?? 0),
        zcr: Number(f.zcr ?? 0),
      });
    },
    injectMidi: () => undefined,
    exportRecording: () => {
      if (session.recorder.isRecording()) lastRec = session.toggleRecord();
      return lastRec ? serializeRecording(lastRec) : null;
    },
    loadRecording: (json) => {
      const rec = parseRecording(json);
      lastRec = rec;
      session.startReplay(rec);
    },
    gotoScene: (id) => session.gotoScene(id),
    blackout: (on) => session.runtime.setBlackout(on),
    panic: () => session.panic(),
  };

  const { parseMidiBytes } = await import("./inputs/midi");
  window.__NUMBRANE_LIVE__.injectMidi = (bytes) => {
    const msg = parseMidiBytes(new Uint8Array(bytes));
    if (msg) session.injectMidi(msg);
  };

  return session;
}

function bindKeys(session: LiveSession): void {
  window.addEventListener("keydown", (ev) => {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
    switch (ev.code) {
      case "Space":
        ev.preventDefault();
        {
          const t = session.runtime.transport;
          const s = t.getSnapshot();
          if (s.playing) t.stop();
          else {
            t.setSource("internal");
            t.start();
          }
        }
        break;
      case "ArrowRight":
        ev.preventDefault();
        void session.gotoScene(session.runtime.getSceneIndex() + 1);
        break;
      case "ArrowLeft":
        ev.preventDefault();
        void session.gotoScene(session.runtime.getSceneIndex() - 1);
        break;
      case "KeyB":
        session.runtime.setBlackout(!session.runtime.isBlackout());
        break;
      case "KeyR":
        session.toggleRecord();
        break;
      case "Escape":
        session.panic();
        break;
      case "KeyH":
        session.showHud = !session.showHud;
        break;
      default:
        break;
    }
  });
}

function mountUi(
  root: HTMLElement,
  session: LiveSession,
  set: SetDef,
  canvas: HTMLCanvasElement,
): void {
  root.innerHTML = "";
  root.appendChild(el("h1", {}, "NUMBRANE LIVE"));
  root.appendChild(el("p", { class: "sub" }, set.name));

  const status = el("pre", { id: "status" }, "…");
  root.appendChild(status);

  const meters = el("div", { class: "meters" });
  const energyBar = el("div", { class: "bar" });
  meters.appendChild(el("label", {}, "energy"));
  meters.appendChild(energyBar);
  root.appendChild(meters);

  const sceneList = el("div", { class: "scenes" });
  set.scenes.forEach((s, i) => {
    const b = el("button", { type: "button", "data-scene": s.id }, `${i + 1}. ${s.name}`);
    b.addEventListener("click", () => void session.gotoScene(s.id));
    sceneList.appendChild(b);
  });
  root.appendChild(sceneList);

  const row = el("div", { class: "row" });
  const mkBtn = (label: string, fn: () => void) => {
    const b = el("button", { type: "button" }, label);
    b.addEventListener("click", fn);
    row.appendChild(b);
  };
  mkBtn("▶/■", () => {
    const t = session.runtime.transport;
    if (t.getSnapshot().playing) t.stop();
    else {
      t.setSource("internal");
      t.start();
    }
  });
  mkBtn("Prev", () => void session.gotoScene(session.runtime.getSceneIndex() - 1));
  mkBtn("Next", () => void session.gotoScene(session.runtime.getSceneIndex() + 1));
  mkBtn("Blackout", () => session.runtime.setBlackout(!session.runtime.isBlackout()));
  mkBtn("Panic", () => session.panic());
  mkBtn("Record", () => {
    const stopped = session.toggleRecord();
    if (stopped) {
      const blob = new Blob([serializeRecording(stopped)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `numbrane-live-${Date.now()}.json`;
      a.click();
    }
  });
  mkBtn("Snapshot", () => {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `numbrane-live-${Date.now()}.png`;
    a.click();
  });
  root.appendChild(row);

  const audioSel = el("select", { id: "audio-device" }) as HTMLSelectElement;
  audioSel.appendChild(el("option", { value: "" }, "— audio input —"));
  root.appendChild(el("label", {}, "Audio"));
  root.appendChild(audioSel);
  const audioBtn = el("button", { type: "button" }, "Enable audio");
  audioBtn.addEventListener("click", async () => {
    const devices = await session.audio.listDevices();
    audioSel.innerHTML = "";
    audioSel.appendChild(el("option", { value: "" }, "default"));
    for (const d of devices) {
      audioSel.appendChild(el("option", { value: d.deviceId }, d.label));
    }
    const r = await session.audio.start(audioSel.value || undefined);
    status.textContent = r.ok
      ? status.textContent + "\naudio ok"
      : `audio: ${r.error ?? "denied"} (continuing without input)`;
  });
  root.appendChild(audioBtn);

  const learnBtn = el("button", { type: "button" }, "MIDI Learn → next scene");
  learnBtn.addEventListener("click", () => {
    session.midiMapper.startLearn("action.next_scene", "trigger");
    learnBtn.textContent = "Move a control…";
  });
  root.appendChild(learnBtn);

  const bpm = el("input", { type: "number", value: "120", min: "40", max: "240" }) as HTMLInputElement;
  bpm.addEventListener("change", () => session.runtime.transport.setBpm(Number(bpm.value)));
  root.appendChild(el("label", {}, "BPM"));
  root.appendChild(bpm);
  const tap = el("button", { type: "button" }, "Tap");
  tap.addEventListener("click", () => session.runtime.transport.tap(performance.now()));
  root.appendChild(tap);

  const quality = el("select") as HTMLSelectElement;
  for (const q of ["low", "medium", "high", "ultra"] as QualityProfile[]) {
    quality.appendChild(el("option", { value: q }, q));
  }
  quality.value = "high";
  quality.addEventListener("change", () => session.setQuality(quality.value as QualityProfile));
  root.appendChild(el("label", {}, "Quality"));
  root.appendChild(quality);

  const res = el("select") as HTMLSelectElement;
  for (const r of ["1920x1080", "3840x2160", "1080x1920", "1080x1080"] as ResolutionPreset[]) {
    res.appendChild(el("option", { value: r }, r));
  }
  res.addEventListener("change", () => session.applyResolution(res.value as ResolutionPreset));
  root.appendChild(el("label", {}, "Resolution"));
  root.appendChild(res);

  const hud = el("pre", { id: "hud" }, "");
  root.appendChild(hud);

  root.appendChild(
    el(
      "p",
      { class: "keys" },
      "Keys: Space transport · ←/→ scenes · B blackout · R record · Esc panic · H HUD",
    ),
  );

  session.onStatus = (s) => {
    status.textContent = JSON.stringify(s, null, 2);
  };
  session.onHud = (h) => {
    if (!session.showHud) {
      hud.textContent = "";
      return;
    }
    hud.textContent = `FPS ${h.fps.toFixed(1)}  frame ${h.frameMs.toFixed(1)}ms  gl ${h.glMs.toFixed(1)}ms  audio ${h.audioMs.toFixed(1)}ms  layers ${h.layers}`;
  };

  setInterval(() => {
    const f = session.getFeatures();
    energyBar.style.width = `${Math.round(f.energy * 100)}%`;
  }, 50);
}

async function main(): Promise<void> {
  const hud = document.querySelector("#hud") as HTMLElement;
  const canvas = document.querySelector("#stage") as HTMLCanvasElement;
  await bootLive({ root: hud, canvas, outputOnly: false });
}

const isControlPage =
  typeof document !== "undefined" &&
  document.querySelector("#stage") != null &&
  !location.pathname.includes("live-output");
if (isControlPage) {
  void main();
}
