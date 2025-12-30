import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.e2e\.js/,
  reporter: "list",
  fullyParallel: false,
  timeout: 60_000,
  use: {
    headless: true,
    baseURL: process.env.BASE_URL,
  },
});
