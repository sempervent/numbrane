import { defineConfig, devices } from "@playwright/test";

/** Acceptance against Docker Compose Studio on :8080 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/pfl-acceptance.spec.ts",
  timeout: 180_000,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:8080",
    trace: "on-first-retry",
  },
});
