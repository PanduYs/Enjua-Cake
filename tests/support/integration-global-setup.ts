import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import type { TestProject } from "vitest/node";

/**
 * Provides a disposable, migrated PostgreSQL database for integration tests.
 * - TEST_DATABASE_URL set (CI service container / local instance): schema is reset and migrated.
 * - Otherwise: a Testcontainers PostgreSQL 16 container is started (requires Docker).
 */
export default async function setup(project: TestProject) {
  let url = process.env.TEST_DATABASE_URL;
  let stopContainer: (() => Promise<unknown>) | undefined;

  if (!url) {
    const { PostgreSqlContainer } = await import("@testcontainers/postgresql");
    const container = await new PostgreSqlContainer("postgres:16").start();
    url = container.getConnectionUri();
    stopContainer = () => container.stop();
  }

  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    // Fresh schema every run so tests never depend on leftovers.
    await client.unsafe("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  } finally {
    await client.end({ timeout: 5 });
  }

  project.provide("databaseUrl", url);

  return async () => {
    await stopContainer?.();
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
