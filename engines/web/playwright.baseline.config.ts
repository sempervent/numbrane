import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:5173";

export default defineConfig({
  ...base,
  webServer: undefined,
  use: {
    ...base.use,
    baseURL,
  },
});
