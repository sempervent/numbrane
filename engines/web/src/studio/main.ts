import { StudioApp } from "./app";

function qsMode(): "generate" | "animate" | "react" {
  const m = new URLSearchParams(location.search).get("mode");
  if (m === "animate" || m === "react" || m === "generate") return m;
  return "generate";
}

async function main(): Promise<void> {
  const canvas = document.getElementById("stage") as HTMLCanvasElement | null;
  if (!canvas) throw new Error("#stage canvas missing");
  const app = new StudioApp(canvas);
  const params = new URLSearchParams(location.search);
  if (params.get("piece")) app.pieceId = params.get("piece")!;
  if (params.get("seed")) app.seed = Number(params.get("seed")) >>> 0;
  app.mode = qsMode();
  await app.boot();
}

void main();
