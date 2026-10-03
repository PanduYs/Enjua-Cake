import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/server/db/client";
import { logger } from "@/server/observability/logger";

/**
 * Liveness/readiness for uptime monitoring (plan §36, §39). Reports only ok/fail —
 * no versions, hostnames, or configuration.
 */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json({ ok: true, database: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("health_check_failed", { error });
    return NextResponse.json({ ok: false, database: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
