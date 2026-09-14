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

  const seedUrl = params.get("seed") || params.get("seedArtifact");
  if (seedUrl && seedUrl.endsWith(".json")) {
    try {
      const { fetchSeedManifest, applySeedToParams, seedArtifactBaseUrl } = await import(
        "./seedLoad"
      );
      const man = await fetchSeedManifest(seedUrl);
      const mapped = applySeedToParams(man);
      session.setSeed(Number(mapped.seed) >>> 0);
      const base = seedArtifactBaseUrl(seedUrl);
      const scene = session.runtime.getScene();
      if (scene) {
        for (const layer of scene.layers) {
          const piece = session.runtime.getPiece(layer.id);
          if (!piece) continue;
          if (layer.piece === man.piece_id || scene.layers.length === 1) {
            piece.setParameter("seedArtifact", base);
          }
          for (const [k, v] of Object.entries(mapped)) {
            if (k === "seed" || k === "frame") continue;
            piece.setParameter(k, v);
          }
          // re-init so stateful pieces reload U/V or agents
          await piece.initialize({ piece: layer.piece }, Number(mapped.seed) >>> 0);
        }
      }
    } catch {
      // optional — LIVE remains usable without seed artifact
    }
  }

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

function section(title: string): HTMLElement {
  const wrap = el("section", { class: "section" });
  wrap.appendChild(el("h2", {}, title));
  return wrap;
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

  const runtimeStatus = el("pre", { id: "runtime-status", class: "runtime" }, "No audio input");
  root.appendChild(runtimeStatus);

  // ── Audio (primary) ─────────────────────────────────────────────
  const audioSec = section("Audio");
  const meters = el("div", { class: "meters" });
  const energyBar = el("div", { class: "bar", id: "meter-energy" });
  meters.appendChild(el("label", {}, "input level"));
  meters.appendChild(energyBar);
  audioSec.appendChild(meters);

  const audioSel = el("select", { id: "audio-device" }) as HTMLSelectElement;
  audioSel.appendChild(el("option", { value: "" }, "Browser default input"));
  audioSec.appendChild(el("label", {}, "Input device"));
  audioSec.appendChild(audioSel);

  const audioStatus = el("p", { class: "audio-status", id: "audio-status" }, "No audio input");
  audioSec.appendChild(audioStatus);

  const refreshDevices = async () => {
    const devices = await session.audio.listDevices();
    const cur = audioSel.value;
    audioSel.innerHTML = "";
    audioSel.appendChild(el("option", { value: "" }, "Browser default input"));
    for (const d of devices) {
      audioSel.appendChild(el("option", { value: d.deviceId }, d.label));
    }
    if (Array.from(audioSel.options).some((o) => o.value === cur)) audioSel.value = cur;
  };

  const startAudio = async () => {
    const r = await session.audio.start(audioSel.value || undefined);
    await refreshDevices();
    if (r.ok) {
      audioStatus.textContent = session.audio.statusMessage;
    } else {
      audioStatus.textContent = "No audio input";
    }
  };

  const audioBtn = el("button", { type: "button", class: "primary" }, "Enable microphone / audio");
  audioBtn.addEventListener("click", () => void startAudio());
  audioSec.appendChild(audioBtn);

  audioSel.addEventListener("change", () => {
    if (session.audio.isActive() || session.audio.status === "lost") {
      void startAudio();
    }
  });

  const reconnectBtn = el("button", { type: "button" }, "Reconnect input");
  reconnectBtn.addEventListener("click", async () => {
    const r = await session.audio.reconnect();
    audioStatus.textContent = r.ok ? session.audio.statusMessage : "No audio input";
    await refreshDevices();
  });
  audioSec.appendChild(reconnectBtn);
  session.audio.watchDevices(() => void refreshDevices());
  root.appendChild(audioSec);

  // ── Set / Scene ─────────────────────────────────────────────────
  const setSec = section("Set / Scene");
  setSec.appendChild(el("p", { class: "muted" }, `Set: ${set.name} (${set.set_id})`));
  const sceneList = el("div", { class: "scenes" });
  set.scenes.forEach((s, i) => {
    const b = el("button", { type: "button", "data-scene": s.id }, `${i + 1}. ${s.name}`);
    b.addEventListener("click", () => void session.gotoScene(s.id));
    sceneList.appendChild(b);
  });
  setSec.appendChild(sceneList);
  const nav = el("div", { class: "row" });
  const mkBtn = (parent: HTMLElement, label: string, fn: () => void) => {
    const b = el("button", { type: "button" }, label);
    b.addEventListener("click", fn);
    parent.appendChild(b);
  };
  mkBtn(nav, "Prev", () => void session.gotoScene(session.runtime.getSceneIndex() - 1));
  mkBtn(nav, "Next", () => void session.gotoScene(session.runtime.getSceneIndex() + 1));
  mkBtn(nav, "Blackout", () => session.runtime.setBlackout(!session.runtime.isBlackout()));
  mkBtn(nav, "Panic", () => session.panic());
  setSec.appendChild(nav);
  root.appendChild(setSec);

  // ── Transport (internal default) ────────────────────────────────
  const transportSec = section("Transport");
  transportSec.appendChild(
    el("p", { class: "muted" }, "Internal BPM by default. Tempo is optional for audio-reactive visuals."),
  );
  const bpm = el("input", {
    type: "number",
    value: String(set.bpm ?? 120),
    min: "40",
    max: "240",
  }) as HTMLInputElement;
  bpm.addEventListener("change", () => session.runtime.transport.setBpm(Number(bpm.value)));
  transportSec.appendChild(el("label", {}, "BPM"));
  transportSec.appendChild(bpm);
  const tRow = el("div", { class: "row" });
  mkBtn(tRow, "▶/■", () => {
    const t = session.runtime.transport;
    if (t.getSnapshot().playing) t.stop();
    else {
      t.setSource("internal");
      t.start();
    }
  });
  mkBtn(tRow, "Tap", () => session.runtime.transport.tap(performance.now()));
  transportSec.appendChild(tRow);
  root.appendChild(transportSec);

  // ── Visuals ─────────────────────────────────────────────────────
  const visSec = section("Visuals");
  const quality = el("select") as HTMLSelectElement;
  for (const q of ["low", "medium", "high", "ultra"] as QualityProfile[]) {
    quality.appendChild(el("option", { value: q }, q));
  }
  quality.value = "high";
  quality.addEventListener("change", () => session.setQuality(quality.value as QualityProfile));
  visSec.appendChild(el("label", {}, "Quality"));
  visSec.appendChild(quality);
  root.appendChild(visSec);

  // ── Recording ───────────────────────────────────────────────────
  const recSec = section("Recording");
  const recRow = el("div", { class: "row" });
  mkBtn(recRow, "Record", () => {
    const stopped = session.toggleRecord();
    if (stopped) {
      const blob = new Blob([serializeRecording(stopped)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `numbrane-live-${Date.now()}.json`;
      a.click();
    }
  });
  mkBtn(recRow, "Snapshot", () => {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `numbrane-live-${Date.now()}.png`;
    a.click();
  });
  recSec.appendChild(recRow);
  root.appendChild(recSec);

  // ── Output ──────────────────────────────────────────────────────
  const outSec = section("Output");
  outSec.appendChild(
    el(
      "p",
      { class: "muted" },
      "Fullscreen on another display, or OBS Browser Source (output only — not an audio path).",
    ),
  );
  const res = el("select") as HTMLSelectElement;
  for (const r of ["1920x1080", "3840x2160", "1080x1920", "1080x1080"] as ResolutionPreset[]) {
    res.appendChild(el("option", { value: r }, r));
  }
  res.addEventListener("change", () => session.applyResolution(res.value as ResolutionPreset));
  outSec.appendChild(el("label", {}, "Resolution"));
  outSec.appendChild(res);
  const outLink = el("a", {
    href: "/live-output.html?set=pfl-default",
    target: "_blank",
    rel: "noopener",
  }, "Open OBS / display output");
  outSec.appendChild(outLink);
  root.appendChild(outSec);

  // ── Optional MIDI ───────────────────────────────────────────────
  const midiSec = section("Optional external control (MIDI)");
  midiSec.appendChild(
    el(
      "p",
      { class: "muted" },
      "Not required. Enable only if you want MIDI Learn or optional MIDI Clock.",
    ),
  );
  const midiStatus = el("p", { class: "muted", id: "midi-status" }, "MIDI off");
  midiSec.appendChild(midiStatus);
  const midiEnable = el("button", { type: "button" }, "Enable MIDI (optional)");
  midiEnable.addEventListener("click", async () => {
    const r = await session.enableMidi();
    midiStatus.textContent = r.ok
      ? `MIDI on · ${session.midi.listDevices().length} device(s)`
      : `MIDI unavailable · ${r.error ?? "continuing without MIDI"}`;
  });
  midiSec.appendChild(midiEnable);
  const learnBtn = el("button", { type: "button" }, "MIDI Learn → next scene");
  learnBtn.addEventListener("click", () => {
    session.midiMapper.startLearn("action.next_scene", "trigger");
    learnBtn.textContent = "Move a control…";
  });
  midiSec.appendChild(learnBtn);
  root.appendChild(midiSec);

  const hud = el("pre", { id: "hud" }, "");
  root.appendChild(hud);
  root.appendChild(
    el(
      "p",
      { class: "keys" },
      "Keys: Space transport · ←/→ scenes · B blackout · R record · Esc panic · H HUD",
    ),
  );

  const renderStatus = (s: Record<string, unknown>) => {
    const audioLine = String(s.audioStatus ?? "No audio input");
    audioStatus.textContent = audioLine;
    runtimeStatus.textContent = [
      `Audio: ${audioLine}`,
      `Set: ${s.setName ?? s.set ?? "—"}`,
      `Scene: ${s.scene ?? "—"}`,
      `Transport: ${(s.transport as { source?: string; bpm?: number; playing?: boolean } | undefined)?.source ?? "internal"} · ${
        (s.transport as { bpm?: number } | undefined)?.bpm ?? "—"
      } BPM · ${
        (s.transport as { playing?: boolean } | undefined)?.playing ? "playing" : "stopped"
      }`,
    ].join("\n");
  };

  session.onStatus = (s) => renderStatus(s);
  session.onHud = (h) => {
    if (!session.showHud) {
      hud.textContent = "";
      return;
    }
    const f = session.getFeatures();
    hud.textContent = `FPS ${h.fps.toFixed(1)}  frame ${h.frameMs.toFixed(1)}ms  gl ${h.glMs.toFixed(1)}ms  audio-dsp ${h.audioMs.toFixed(1)}ms  layers ${h.layers}  energy ${f.energy.toFixed(2)}`;
  };

  setInterval(() => {
    const f = session.getFeatures();
    const active = session.audio.isActive();
    energyBar.style.width = `${Math.round((active ? f.energy : 0) * 100)}%`;
    if (!active && session.audio.status !== "active") {
      energyBar.style.opacity = "0.35";
    } else {
      energyBar.style.opacity = "1";
    }
  }, 50);

  renderStatus({
    audioStatus: session.audio.statusMessage,
    set: set.set_id,
    setName: set.name,
    scene: session.runtime.getScene()?.id,
    transport: session.runtime.transport.getSnapshot(),
  });
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
