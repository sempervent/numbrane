import { defineConfig, devices } from "@playwright/test";

/**
 * Headless Chromium with optional software GL for CI GPUs.
 * Set PW_CHROMIUM_ARGS='--use-angle=swiftshader' in CI.
 */
const extraArgs = (process.env.PW_CHROMIUM_ARGS ?? "--use-angle=swiftshader")
  .split(" ")
  .filter(Boolean);

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/studio-animation.spec.ts"],
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173",
    url: "http://127.0.0.1:5173/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--enable-webgl",
            "--ignore-gpu-blocklist",
            "--enable-unsafe-swiftshader",
            ...extraArgs,
          ],
        },
      },
    },
  ],
});
