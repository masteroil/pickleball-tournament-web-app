import { defineConfig } from "@playwright/test";
const external = process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: external || "http://127.0.0.1:4188",
    viewport: { width: 390, height: 844 },
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
  },
  webServer: external
    ? undefined
    : {
        command:
          "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4188 --strictPort",
        url: "http://127.0.0.1:4188",
        env: { DEMO_FILE: ".demo-test-" + Date.now() + ".json" },
        reuseExistingServer: false,
      },
});
