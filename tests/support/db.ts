import { inject } from "vitest";

import { createDatabase, type DatabaseHandle } from "@/server/db/client";

/** Opens a connection to the migrated integration-test database. */
export function openTestDatabase(): DatabaseHandle {
  return createDatabase(inject("databaseUrl"), { max: 5, silenceNotices: true });
}

/** Removes rows created by a test file (FK-safe order). */
export async function resetAuthTables(handle: DatabaseHandle): Promise<void> {
  const { sql } = await import("drizzle-orm");
  await handle.db.execute(sql`TRUNCATE audit_logs, rate_limits, admin_sessions, admin_accounts, auth_verifications, admins RESTART IDENTITY CASCADE`);
}
