import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/studio-performance-quick-switch.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  use: {
    baseURL: process.env.STUDIO_URL ?? "http://127.0.0.1:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
        },
      },
    },
  ],
});
