/**
 * Audiovisual nodes LIVE — NodesWorld simulation + plasma visual modes.
 */

import { FULLSCREEN_VERTEX_SHADER, loadShader } from "../../gl";
import { NodesWorld } from "../../nodesWorld";
import type { FrameState, LivePiece, LiveTelemetry, RenderContext } from "../piece";
import type { VisualMode } from "../../types";

export async function createNodesLivePiece(
  gl: WebGL2RenderingContext,
  pieceId: string,
): Promise<LivePiece> {
  const plasmaFrag = await loadShader("plasma.frag");
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, FULLSCREEN_VERTEX_SHADER);
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, plasmaFrag);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    throw new Error(`plasma compile: ${gl.getShaderInfoLog(fs)}`);
  }
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`plasma link: ${gl.getProgramInfoLog(prog)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const world = new NodesWorld(42);
  let seed = 42;
  let last: FrameState = {
    frame: 0,
    t: 0,
    dt: 1 / 60,
    fps: 60,
    beat: 0,
    bar: 0,
    beatPhase: 0,
    bpm: 120,
  };
  const params: Record<string, number> = {
    complexity: 28,
    mutation: 0.25,
    chaos: 0.35,
    palette: 200,
    exposure: 1.2,
    hue: 0.55,
    density: 0.7,
  };
  const audio = { energy: 0, low: 0, mid: 0, high: 0, onset: 0 };

  const loc = (name: string) => gl.getUniformLocation(prog, name);

  const reseedNodes = () => {
    world.reset(seed, {
      complexity: Math.floor(params.complexity),
      mutation: params.mutation,
      chaos: params.chaos,
      palette: params.palette,
      exposure: params.exposure,
      mode: "plasma" as VisualMode,
      playing: true,
    });
    const n = Math.max(6, Math.floor(params.complexity * 0.35));
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);
      world.addNode(0.15 + t * 0.7, 0.2 + ((seed + i * 17) % 97) / 97 * 0.6);
    }
  };

  return {
    id: pieceId,
    initialize(_recipe, s) {
      seed = s >>> 0;
      params.palette = (seed % 360);
      params.hue = params.palette / 360;
      reseedNodes();
    },
    resize() {},
    update(frame) {
      last = frame;
      if (frame.frame % 45 === 0 && world.nodes.length < params.complexity) {
        const x = 0.1 + ((seed + frame.frame * 13) % 1000) / 1000 * 0.8;
        const y = 0.1 + ((seed + frame.frame * 29) % 1000) / 1000 * 0.8;
        world.addNode(x, y);
      }
      world.tickMutations(frame.dt);
      world.nodes = world.nodes.filter((n) => n.life > 0.02);
      if (audio.onset > 0.5 && world.nodes.length < params.complexity * 1.2) {
        world.addNode(0.2 + audio.low * 0.6, 0.2 + audio.mid * 0.6);
      }
    },
    setParameter(name, value) {
      if (typeof value !== "number") return;
      if (name.startsWith("audio.")) {
        const k = name.slice(6) as keyof typeof audio;
        if (k in audio) audio[k] = value;
        return;
      }
      params[name] = value;
      if (name === "complexity" || name === "chaos" || name === "mutation") {
        world.params.complexity = Math.floor(params.complexity);
        world.params.mutation = params.mutation;
        world.params.chaos = params.chaos;
      }
      if (name === "palette" || name === "hue") {
        world.params.palette = name === "hue" ? value * 360 : value;
      }
    },
    getParameter(name) {
      return params[name];
    },
    getBaseParameters() {
      return { ...params };
    },
    getTelemetry(): LiveTelemetry {
      const motion =
        world.nodes.reduce((s, n) => s + Math.abs(n.vx) + Math.abs(n.vy), 0) /
        Math.max(1, world.nodes.length);
      return {
        energy: audio.energy + params.chaos * 0.4,
        texture: world.nodes.length / Math.max(1, params.complexity),
        motion: motion + Math.sin(last.t) * 0.1,
        spectral: audio.mid,
      };
    },
    render(ctx: RenderContext) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, ctx.framebuffer);
      gl.viewport(0, 0, ctx.width, ctx.height);
      if (ctx.transparent) gl.clearColor(0, 0, 0, 0);
      else gl.clearColor(0.02, 0.02, 0.03, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindVertexArray(null);
      gl.useProgram(prog);
      const nodeMotion =
        world.nodes.reduce((s, n) => s + Math.abs(n.vx) + Math.abs(n.vy), 0) /
        Math.max(1, world.nodes.length);
      gl.uniform2f(loc("u_res"), ctx.width, ctx.height);
      gl.uniform1f(loc("u_time"), last.t);
      gl.uniform1f(loc("u_chaos"), params.chaos + audio.energy * 0.35);
      gl.uniform1f(loc("u_mutation"), params.mutation + nodeMotion * 2);
      gl.uniform1f(loc("u_paletteHue"), params.palette + audio.high * 40);
      gl.uniform1f(loc("u_exposure"), params.exposure);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteProgram(prog);
    },
    exportState() {
      return {
        json: {
          kind: "nodes-live",
          seed,
          nodes: world.nodes,
          params: { ...params },
        },
      };
    },
    importState(s) {
      if (s.json?.nodes && Array.isArray(s.json.nodes)) {
        world.reset(seed);
        world.nodes = s.json.nodes as typeof world.nodes;
      } else {
        reseedNodes();
      }
    },
  };
}
