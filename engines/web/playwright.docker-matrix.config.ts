import { defineConfig, devices } from "@playwright/test";

const extraArgs = (process.env.PW_CHROMIUM_ARGS ?? "--use-angle=swiftshader")
  .split(" ")
  .filter(Boolean);

const webglArgs = [
  "--enable-webgl",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
  ...extraArgs,
];

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["**/docker-piece-matrix.spec.ts", "**/docker-preview-contamination.spec.ts", "**/studio-crossfade.spec.ts"],
  timeout: 120_000,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:8080",
    trace: "on-first-retry",
    launchOptions: { args: webglArgs },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { args: webglArgs } } }],
});
