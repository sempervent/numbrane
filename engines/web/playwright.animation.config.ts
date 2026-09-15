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

/** Animation liveness against Docker Compose Studio on :8080 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/studio-animation.spec.ts",
  timeout: 120_000,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:8080",
    trace: "on-first-retry",
    actionTimeout: 15_000,
    launchOptions: {
      args: webglArgs,
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: webglArgs,
        },
      },
    },
  ],
});
