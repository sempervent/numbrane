import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

const port = 5199;

export default defineConfig({
  ...base,
  testDir: "./tests/e2e",
  testMatch: [
    "**/pfl-visualizer.spec.ts",
    "**/pfl-visual-quality.spec.ts",
    "**/pfl-artwork-types.spec.ts",
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/pfl.html`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    ...base.use,
    baseURL: `http://127.0.0.1:${port}`,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--enable-webgl", "--ignore-gpu-blocklist"],
        },
      },
    },
  ],
});
