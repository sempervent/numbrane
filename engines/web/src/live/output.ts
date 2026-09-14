/**
 * OBS / fullscreen output entry (no chrome).
 */
import { bootLive } from "./main";

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  if (!params.has("output")) {
    params.set("output", "1");
    history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
  }
  const canvas = document.querySelector("#stage") as HTMLCanvasElement;
  const root = document.querySelector("#hud") as HTMLElement;
  await bootLive({ root, canvas, outputOnly: true });
}

void main();
