import { execFileSync } from "node:child_process";

import postgres from "postgres";

import { E2E_ADMIN, E2E_ORDERS_ADMIN } from "./fixtures";

/** Fresh schema + migrations + sample catalog with E2E fixtures. */
export default async function globalSetup() {
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
}
