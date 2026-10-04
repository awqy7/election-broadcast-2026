import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:8790",
    viewport: { width: 1920, height: 1080 },
    trace: "retain-on-failure",
  },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.005 } },
  webServer: {
    command: "node dist/server/main.js",
    url: "http://127.0.0.1:8790/health",
    reuseExistingServer: false,
    env: {
      DATA_MODE: "mock",
      PORT: "8790",
      HOST: "127.0.0.1",
      DATA_DIR: "data/e2e",
      ADMIN_ACCESS_KEY: "e2e-access-key-123456",
      TSE_POLL_INTERVAL_MS: "600000",
    },
  },
  snapshotPathTemplate: "{testDir}/golden/{arg}{ext}",
});
