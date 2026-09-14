/**
 * Live piece runtime contract.
 * Pieces do not own MIDI/audio devices, scenes, or OBS — only render state.
 */

export type FrameState = {
  /** Logical frame index (when driven by fps). */
  frame: number;
  /** Logical seconds (frame/fps or transport-derived). */
  t: number;
  dt: number;
  fps: number;
  beat: number;
  bar: number;
  beatPhase: number;
  bpm: number;
};

export type LiveTelemetry = {
  energy: number;
  texture: number;
  motion: number;
  spectral: number;
};

export type RenderContext = {
  /** Target framebuffer (null = default canvas). */
  framebuffer: WebGLFramebuffer | null;
  width: number;
  height: number;
  /** When true, clear with alpha 0. */
  transparent: boolean;
};

export type LivePiece = {
  readonly id: string;
  initialize(recipe: Record<string, unknown>, seed: number): void | Promise<void>;
  resize(width: number, height: number): void;
  update(frame: FrameState): void;
  render(ctx: RenderContext): void;
  setParameter(name: string, value: number | string | boolean): void;
  getParameter(name: string): number | string | boolean | undefined;
  getBaseParameters(): Record<string, number>;
  getTelemetry(): LiveTelemetry;
  dispose(): void;
};

export type LivePieceFactory = (gl: WebGL2RenderingContext) => LivePiece;
