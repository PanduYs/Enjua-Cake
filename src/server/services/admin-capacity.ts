import "server-only";

import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";

import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/client";
import { pickupDates } from "@/server/db/schema";
import { addCalendarDays, compareIsoDates, parseIsoDate, toWibDate, type IsoDate } from "@/server/domain/time/wib";
import { writeAudit } from "@/server/observability/audit";

import { capacityFactsForDates, countActiveOrders, lockPickupDate } from "./capacity";
import { getSettings } from "./settings";

export interface CapacityRow {
  date: IsoDate;
  capacity: number;
  capacityOverride: number | null;
  used: number;
  remaining: number;
  isBlocked: boolean;
  blockReason: string | null;
  status: "AVAILABLE" | "FULL" | "BLOCKED";
}

/** Capacity table (PRD §11): capacity, used, remaining, status per pickup date. */
export async function listCapacity(db: Database, clock: Clock, options: { from?: string; days?: number } = {}): Promise<{ rows: CapacityRow[]; defaultCapacity: number; horizonDays: number; today: IsoDate }> {
  const settings = await getSettings(db);
  const now = clock.now();
  const today = toWibDate(now);
  let from = today;
  try {
    if (options.from) from = parseIsoDate(options.from);
  } catch {
    from = today;
  }
  const days = Math.min(Math.max(options.days ?? 31, 1), 120);
  const dates = Array.from({ length: days }, (_, i) => addCalendarDays(from, i));
  const [facts, rows] = await Promise.all([
    capacityFactsForDates(db, dates, settings.default_capacity, now),
    db
      .select()
      .from(pickupDates)
      .where(and(gte(pickupDates.date, dates[0]!), lte(pickupDates.date, dates[dates.length - 1]!)))
      .orderBy(asc(pickupDates.date)),
  ]);
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return {
    defaultCapacity: settings.default_capacity,
    horizonDays: settings.booking_horizon_days,
    today,
    rows: dates.map((date) => {
      const f = facts.get(date)!;
      const row = byDate.get(date);
      return {
        date,
        capacity: f.capacity,
        capacityOverride: row?.capacityOverride ?? null,
        used: f.used,
        remaining: Math.max(f.capacity - f.used, 0),
        isBlocked: f.isBlocked,
        blockReason: row?.blockReason ?? null,
        status: f.isBlocked ? "BLOCKED" : f.used >= f.capacity ? "FULL" : "AVAILABLE",
      };
    }),
  };
}

/** One date's facts, for the Manual Order form. */
export async function capacityForDate(db: Database, clock: Clock, rawDate: string) {
  let date: IsoDate;
  try {
    date = parseIsoDate(rawDate);
  } catch {
    return null;
  }
  const settings = await getSettings(db);
  const facts = (await capacityFactsForDates(db, [date], settings.default_capacity, clock.now())).get(date)!;
  return { date, ...facts, remaining: Math.max(facts.capacity - facts.used, 0) };
}

export type CapacityError = "INVALID_DATE" | "PAST_DATE" | "INVALID_CAPACITY";

const dateSchema = z.string().transform((v, ctx) => {
  try {
    return parseIsoDate(v);
  } catch {
    ctx.addIssue({ code: "custom", message: "INVALID_DATE" });
    return z.NEVER;
  }
});

/**
 * Block/unblock a date or set/clear its capacity override (FD-06, FD-07). The row
 * is locked like an order creation so a change and a checkout never interleave.
 * Existing valid orders are never cancelled or moved (EC-14): the date only stops
 * accepting new orders.
 */
export async function updatePickupDate(
  db: Database,
  clock: Clock,
  args: { date: string; adminId: string } & ({ kind: "block"; blocked: boolean; reason?: string | null } | { kind: "capacity"; capacityOverride: number | null }),
): Promise<{ ok: true; used: number } | { ok: false; error: CapacityError }> {
  const parsed = dateSchema.safeParse(args.date);
  if (!parsed.success) return { ok: false, error: "INVALID_DATE" };
  const date = parsed.data;
  const now = clock.now();
  if (compareIsoDates(date, toWibDate(now)) < 0) return { ok: false, error: "PAST_DATE" };
  if (args.kind === "capacity" && args.capacityOverride !== null && (!Number.isInteger(args.capacityOverride) || args.capacityOverride < 0 || args.capacityOverride > 1000)) {
    return { ok: false, error: "INVALID_CAPACITY" };
  }
  const settings = await getSettings(db);

  return db.transaction(async (tx) => {
    await lockPickupDate(tx, date, settings.default_capacity, now);
    const [before] = await tx.select().from(pickupDates).where(eq(pickupDates.date, date));
    const patch =
      args.kind === "block"
        ? { isBlocked: args.blocked, blockReason: args.blocked ? args.reason?.trim() || null : null }
        : { capacityOverride: args.capacityOverride };
    await tx
      .update(pickupDates)
      .set({ ...patch, updatedByAdminId: args.adminId, updatedAt: now })
      .where(eq(pickupDates.date, date));
    const used = (await countActiveOrders(tx, [date], now)).get(date) ?? 0;
    await writeAudit(tx, {
      entityType: "pickup_date",
      entityId: date,
      eventType: args.kind === "block" ? (args.blocked ? "DATE_BLOCKED" : "DATE_UNBLOCKED") : "CAPACITY_OVERRIDE_CHANGED",
      oldValue: args.kind === "block" ? { isBlocked: before?.isBlocked ?? false, blockReason: before?.blockReason ?? null } : { capacityOverride: before?.capacityOverride ?? null },
      newValue: { ...patch, activeOrders: used },
      reason: args.kind === "block" ? (patch as { blockReason: string | null }).blockReason : null,
      actor: { type: "ADMIN", adminId: args.adminId },
    });
    return { ok: true, used } as const;
  });
}
