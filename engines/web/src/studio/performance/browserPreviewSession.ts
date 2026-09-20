/**
 * Single shared live preview session for browser motion + faithful live posters.
 * At most one piece preview runs at a time (no GPU furnace grid).
 */

import { LiveSession } from "../../live/session";
import type { SetDef } from "../../live/types";
import { buildMashupSet } from "../mashups";
import {
  normalizeSpecForLivePerformance,
  resolveLivePerformanceMethodSpec,
} from "../animation/performance";
import { defaultAnimationMethodId } from "../animation/methods";
import { studioSurface } from "../runtime/surface";
import { thumbRequestForPiece } from "./browserThumbs";

export function singlePieceAnimateSet(
  pieceId: string,
  seed: number,
  parameters: Record<string, number | string | boolean>,
): SetDef {
  const mashup = buildMashupSet(pieceId, seed, parameters);
  if (mashup) return mashup;
  return {
    protocol_version: "0.1.0",
    set_id: "browser-preview",
    name: pieceId,
    scenes: [
      {
        id: "main",
        name: pieceId,
        layers: [
          {
            id: "L0",
            piece: pieceId,
            opacity: 1,
            blend: "normal",
            seed,
            parameters,
          },
        ],
        modulation: [],
        post: { bloom: 0.22, feedback: 0.06, vignette: 0.12 },
      },
    ],
    cues: [],
  };
}

export function usesLiveBrowserPreview(pieceId: string): boolean {
  return studioSurface(pieceId, "animate") === "live";
}

export class BrowserPreviewSession {
  private session: LiveSession | null = null;
  private rafId = 0;
  private lastFrameMs = 0;
  private readonly targetFrameMs = 1000 / 18;
  private activePieceId: string | null = null;
  private opChain: Promise<void> = Promise.resolve();
  private readonly reducedMotion: boolean;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  get isReducedMotion(): boolean {
    return this.reducedMotion;
  }

  get runningPieceId(): string | null {
    return this.activePieceId;
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.opChain.then(fn, fn);
    this.opChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async mountPiece(pieceId: string): Promise<LiveSession> {
    const req = thumbRequestForPiece(pieceId);
    if (this.session && this.activePieceId === pieceId) return this.session;

    await this.teardown();
    this.activePieceId = pieceId;
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.session = new LiveSession({
      canvas: this.canvas,
      seed: req.seed,
      outputOnly: false,
      transparent: false,
    });
    await this.session.init();
    const set = singlePieceAnimateSet(pieceId, req.seed, req.parameters);
    await this.session.loadSet(set, "animate");
    this.session.setSeed(req.seed);
    const piece = this.session.runtime.getPiece("L0");
    for (const [k, v] of Object.entries(req.parameters)) {
      if (typeof v === "number") piece?.setParameter(k, v);
    }
    const methodId = defaultAnimationMethodId(pieceId);
    const spec = normalizeSpecForLivePerformance(
      pieceId,
      resolveLivePerformanceMethodSpec(pieceId, methodId, "animate"),
      "animate",
    );
    this.session.setAnimationSpec(spec);
    this.session.animationRuntime.performanceMode = true;
    this.session.runtime.setSimulationPaused(false);
    this.session.runtime.transport.start();
    this.session.ensureLoopRunning();
    this.session.paintFrames(3, performance.now());
    void w;
    void h;
    return this.session;
  }

  startMotion(pieceId: string): Promise<void> {
    if (this.reducedMotion) return Promise.resolve();
    return this.enqueue(async () => {
      if (this.activePieceId === pieceId && this.rafId) return;
      await this.mountPiece(pieceId);
      cancelAnimationFrame(this.rafId);
      this.lastFrameMs = 0;
      const tick = (now: number) => {
        if (!this.session || this.activePieceId !== pieceId) return;
        if (!this.lastFrameMs || now - this.lastFrameMs >= this.targetFrameMs) {
          this.session.frame(now);
          this.lastFrameMs = now;
        }
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    });
  }

  stopMotion(): Promise<void> {
    return this.enqueue(async () => {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    });
  }

  async captureLivePoster(pieceId: string): Promise<Blob | null> {
    if (!usesLiveBrowserPreview(pieceId)) return null;
    return this.enqueue(async () => {
      await this.stopMotion();
      await this.mountPiece(pieceId);
      for (let i = 0; i < 6; i++) {
        this.session?.frame(performance.now() + i * (1000 / 24));
      }
      return new Promise<Blob | null>((resolve) => {
        this.canvas.toBlob((b) => resolve(b), "image/png");
      });
    });
  }

  async teardown(): Promise<void> {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    if (this.session) {
      await this.session.dispose();
      this.session = null;
    }
    this.activePieceId = null;
  }

  dispose(): Promise<void> {
    return this.enqueue(() => this.teardown());
  }
}
