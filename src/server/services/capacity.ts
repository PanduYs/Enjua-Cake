import "server-only";

import { and, eq, gt, inArray, ne, or, sql, type SQL } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { orders, pickupDates } from "@/server/db/schema";
import { effectiveCapacity, type DateCapacityFacts } from "@/server/domain/checkout/pickup-date";
import type { IsoDate } from "@/server/domain/time/wib";

/** A transaction or the root database handle. */
export type DbExecutor = Pick<Database, "select" | "insert" | "execute">;

/**
 * Orders that occupy a pickup slot (IMPLEMENTATION-PLAN §13.2): not cancelled AND
 * (Cash OR has confirmed payment OR waiting verification OR reservation still valid).
 * Reservations past their expiry no longer count even before the sweeper runs (TD-07).
 */
export function activeOrderCondition(now: Date): SQL {
  return and(
    ne(orders.orderStatus, "CANCELLED"),
    or(
      eq(orders.paymentMethod, "CASH"),
      gt(orders.paidAmount, 0),
      eq(orders.paymentStatus, "WAITING_VERIFICATION"),
      gt(orders.reservationExpiresAt, now),
    ),
  )!;
}

/** Slots used per date. Dates without orders are absent (treat as 0). */
export async function countActiveOrders(db: DbExecutor, dates: readonly IsoDate[], now: Date): Promise<Map<string, number>> {
  if (dates.length === 0) return new Map();
  const rows = await db
    .select({ date: orders.pickupDate, used: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(inArray(orders.pickupDate, [...dates]), activeOrderCondition(now)))
    .groupBy(orders.pickupDate);
  return new Map(rows.map((r) => [r.date, r.used]));
}

export async function loadPickupDateRows(db: DbExecutor, dates: readonly IsoDate[]) {
  if (dates.length === 0) return new Map<string, { capacityOverride: number | null; isBlocked: boolean }>();
  const rows = await db
    .select({ date: pickupDates.date, capacityOverride: pickupDates.capacityOverride, isBlocked: pickupDates.isBlocked })
    .from(pickupDates)
    .where(inArray(pickupDates.date, [...dates]));
  return new Map(rows.map((r) => [r.date, { capacityOverride: r.capacityOverride, isBlocked: r.isBlocked }]));
}

/** Capacity facts for many dates without locking (display only). */
export async function capacityFactsForDates(
  db: DbExecutor,
  dates: readonly IsoDate[],
  defaultCapacity: number,
  now: Date,
): Promise<Map<string, DateCapacityFacts>> {
  const [rows, used] = await Promise.all([loadPickupDateRows(db, dates), countActiveOrders(db, dates, now)]);
  return new Map(
    dates.map((date) => {
      const row = rows.get(date);
      return [
        date,
        { isBlocked: row?.isBlocked ?? false, capacity: effectiveCapacity(row?.capacityOverride ?? null, defaultCapacity), used: used.get(date) ?? 0 },
      ];
    }),
  );
}

/**
 * Locks the pickup date row for the rest of the transaction (TD-06) and returns
 * fresh capacity facts. Every order creation for a date — website or Manual Order —
 * must call this inside its transaction before checking capacity and inserting,
 * which serializes competing checkouts for the same date (EC-01, EC-19).
 */
export async function lockPickupDate(tx: DbExecutor, date: IsoDate, defaultCapacity: number, now: Date): Promise<DateCapacityFacts> {
  await tx.execute(sql`INSERT INTO pickup_dates (date) VALUES (${date}) ON CONFLICT (date) DO NOTHING`);
  const locked = await tx.execute<{ capacity_override: number | null; is_blocked: boolean }>(
    sql`SELECT capacity_override, is_blocked FROM pickup_dates WHERE date = ${date} FOR UPDATE`,
  );
  const row = locked[0];
  if (!row) throw new Error(`pickup_dates row for ${date} missing after upsert`);
  const used = (await countActiveOrders(tx, [date], now)).get(date) ?? 0;
  return { isBlocked: row.is_blocked, capacity: effectiveCapacity(row.capacity_override, defaultCapacity), used };
}
