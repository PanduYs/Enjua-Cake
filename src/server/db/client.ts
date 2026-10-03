import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getEnv } from "@/server/env";

import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  close: () => Promise<void>;
}

export function createDatabase(url: string, options: { max?: number; silenceNotices?: boolean } = {}): DatabaseHandle {
  const client = postgres(url, {
    max: options.max ?? 10,
    prepare: false,
    ...(options.silenceNotices ? { onnotice: () => {} } : {}),
  });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: 5 }),
  };
}

const globalForDb = globalThis as unknown as { __enjuaDb?: DatabaseHandle };

/** Process-wide database handle, reused across hot reloads in development. */
export function getDb(): Database {
  if (!globalForDb.__enjuaDb) {
    const env = getEnv();
    // prepare:false (above) keeps this compatible with transaction-mode poolers (e.g. Supabase/PgBouncer).
    globalForDb.__enjuaDb = createDatabase(env.DATABASE_URL, { max: env.DATABASE_POOL_MAX });
  }
  return globalForDb.__enjuaDb.db;
}
