import { defineConfig } from "@playwright/test";

const port = 4174;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "/tmp/phi-theme-studio-playwright",
  reporter: "line",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    serviceWorkers: "block",
    viewport: { width: 1800, height: 1200 },
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
