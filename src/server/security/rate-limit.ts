import "server-only";

import { sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";

export interface RateLimitRule {
  /** Maximum attempts allowed inside one window. */
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Database-backed fixed-window counter (works on serverless, IMPLEMENTATION-PLAN §30).
 * A single INSERT … ON CONFLICT statement makes increment + window reset atomic.
 */
export async function consumeRateLimit(db: Database, key: string, rule: RateLimitRule, now: Date): Promise<RateLimitResult> {
  const windowMs = rule.windowSeconds * 1000;
  const nowIso = now.toISOString();
  const windowStartThreshold = new Date(now.getTime() - windowMs).toISOString();

  const rows = await db.execute<{ count: number; window_start: Date | string }>(sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, ${nowIso}, 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start <= ${windowStartThreshold} THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start <= ${windowStartThreshold} THEN ${nowIso}::timestamptz ELSE rate_limits.window_start END
    RETURNING count, window_start
  `);

  const row = rows[0];
  if (!row) throw new Error("Rate limit upsert returned no row");
  const count = Number(row.count);
  const windowStart = new Date(row.window_start);
  const resetAt = windowStart.getTime() + windowMs;

  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds: Math.max(0, Math.ceil((resetAt - now.getTime()) / 1000)),
  };
}

/** Technical defaults for admin login (IMPLEMENTATION-PLAN §8.1). Not business rules. */
export const ADMIN_LOGIN_RATE_LIMITS = {
  perIp: { limit: 20, windowSeconds: 15 * 60 },
  perEmail: { limit: 5, windowSeconds: 15 * 60 },
} as const satisfies Record<string, RateLimitRule>;
