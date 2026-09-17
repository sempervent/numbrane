import { defineConfig, devices } from "@playwright/test";

const browserArgs = (process.env.PW_CHROMIUM_ARGS ?? "--enable-webgl --ignore-gpu-blocklist")
  .split(" ")
  .filter(Boolean);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/studio-visual-audit.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 3_600_000,
  reporter: "line",
  use: {
    baseURL: process.env.STUDIO_URL ?? "http://127.0.0.1:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: browserArgs,
        },
      },
    },
  ],
});
