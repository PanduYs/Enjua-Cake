import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { chromium, type FullConfig } from "@playwright/test";
import postgres from "postgres";

import { E2E_ADMIN, E2E_ORDERS_ADMIN, ORDERS_ADMIN_STATE } from "./fixtures";

/** Fresh schema + migrations + sample catalog with E2E fixtures. */
export default async function globalSetup(config: FullConfig) {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is required (a disposable database; it will be wiped).");

  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client.unsafe("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  } finally {
    await client.end({ timeout: 5 });
  }

  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: url, STORAGE_LOCAL_DIR: ".storage-e2e", NODE_ENV: "development" };
  execFileSync("npm", ["run", "--silent", "db:migrate"], { env, stdio: "inherit" });
  execFileSync("npm", ["run", "--silent", "db:seed-sample", "--", "--reset", "--e2e"], { env, stdio: "inherit" });
  execFileSync("npm", ["run", "--silent", "db:seed-admin"], {
    env: { ...env, SEED_ADMIN_NAME: "Admin E2E", SEED_ADMIN_EMAIL: E2E_ADMIN.email, SEED_ADMIN_PASSWORD: E2E_ADMIN.password },
    stdio: "inherit",
  });
  execFileSync("npm", ["run", "--silent", "db:seed-admin"], {
    env: { ...env, SEED_ADMIN_NAME: "Admin Pesanan", SEED_ADMIN_EMAIL: E2E_ORDERS_ADMIN.email, SEED_ADMIN_PASSWORD: E2E_ORDERS_ADMIN.password },
    stdio: "inherit",
  });

  // Sign the orders admin in once and share the session: specs that need an admin
  // reuse it instead of logging in repeatedly (login is rate-limited per email, §8.1).
  // The web server is already running at this point (see playwright.config.ts).
  const baseURL = config.projects[0]!.use.baseURL!;
  const browser = await chromium.launch(process.env.PW_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE } : {});
  try {
    const page = await browser.newPage({ baseURL });
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(E2E_ORDERS_ADMIN.email);
    await page.getByLabel("Password").fill(E2E_ORDERS_ADMIN.password);
    await page.getByRole("button", { name: "Masuk" }).click();
    await page.waitForURL(/\/admin$/);
    mkdirSync(path.dirname(ORDERS_ADMIN_STATE), { recursive: true });
    await page.context().storageState({ path: ORDERS_ADMIN_STATE });
  } finally {
    await browser.close();
  }
}
