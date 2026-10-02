import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against a production build (`npm run build` first) and a disposable database.
 * Requires E2E_DATABASE_URL (it is wiped and re-seeded with sample data).
 * PW_CHROMIUM_EXECUTABLE can point at a preinstalled Chromium.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
const databaseUrl = process.env.E2E_DATABASE_URL ?? "";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    // Readiness probe must not touch the database: Playwright starts the server
    // before globalSetup has migrated and seeded it.
    url: `${baseURL}/icon.svg`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: databaseUrl,
      APP_URL: baseURL,
      AUTH_SECRET: "e2e-only-secret-not-for-production-0123456789",
      PAYMENT_PROVIDER: "mock",
      MOCK_PAYMENT_WEBHOOK_SECRET: "e2e-only-mock-webhook-secret",
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_DIR: ".storage-e2e",
    },
  },
});
