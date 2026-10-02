import "server-only";

import { and, asc, count, eq, gte, inArray, ne, sql } from "drizzle-orm";

import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/client";
import { orders, paymentExceptions, paymentProofs, paymentTransactions, refunds } from "@/server/db/schema";
import { addCalendarDays, parseIsoDate, toWibDate, wibDateTimeToInstant } from "@/server/domain/time/wib";

import { capacityFactsForDates } from "./capacity";
import { expireDueReservations } from "./order-lifecycle";
import { getSettings } from "./settings";

const STATUSES = ["NEW", "CONFIRMED", "PROCESSING", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"] as const;
const UPCOMING_DAYS = 7;

/**
 * Operational summary (PRD §30, FD-90): orders per status, payments to verify,
 * upcoming pickups with capacity, simple revenue, and what needs attention.
 * Not a BI module (FD-89).
 */
export async function getDashboard(db: Database, clock: Clock) {
  await expireDueReservations(db, clock);
  const now = clock.now();
  const today = toWibDate(now);
  const monthStart = wibDateTimeToInstant(parseIsoDate(`${today.slice(0, 8)}01`));
  const dates = Array.from({ length: UPCOMING_DAYS }, (_, i) => addCalendarDays(today, i));
  const settings = await getSettings(db);

  const [statusRows, proofs, exceptions, facts, upcomingRows, todayOrders, received, receivedMonth, refunded, outstanding, cashUnconfirmed, readyUnpaid, refundCandidates] = await Promise.all([
    db.select({ status: orders.orderStatus, n: count() }).from(orders).groupBy(orders.orderStatus),
    db.select({ n: count() }).from(paymentProofs).where(eq(paymentProofs.verificationStatus, "PENDING")),
    db.select({ n: count() }).from(paymentExceptions).where(eq(paymentExceptions.status, "OPEN")),
    capacityFactsForDates(db, dates, settings.default_capacity, now),
    db
      .select({ date: orders.pickupDate, n: count() })
      .from(orders)
      .where(and(inArray(orders.pickupDate, dates), ne(orders.orderStatus, "CANCELLED")))
      .groupBy(orders.pickupDate),
    db
      .select({ id: orders.id, orderNumber: orders.orderNumber, customerName: orders.customerName, orderStatus: orders.orderStatus, paymentStatus: orders.paymentStatus })
      .from(orders)
      .where(and(eq(orders.pickupDate, today), ne(orders.orderStatus, "CANCELLED")))
      .orderBy(asc(orders.createdAt))
      .limit(50),
    sumPaid(db),
    sumPaid(db, monthStart),
    db
      .select({ total: sql<number>`coalesce(sum(${refunds.amount}), 0)::int` })
      .from(refunds)
      .leftJoin(paymentTransactions, eq(refunds.paymentTransactionId, paymentTransactions.id))
      .where(and(eq(refunds.status, "COMPLETED"), sql`coalesce(${paymentTransactions.isException}, false) = false`)),
    db
      .select({ total: sql<number>`coalesce(sum(${orders.remainingAmount}), 0)::int`, n: count() })
      .from(orders)
      .where(and(inArray(orders.orderStatus, ["NEW", "CONFIRMED", "PROCESSING", "READY_FOR_PICKUP"]), sql`${orders.remainingAmount} > 0`)),
    attentionOrders(db, and(eq(orders.paymentMethod, "CASH"), eq(orders.orderStatus, "NEW"))!),
    attentionOrders(db, and(eq(orders.orderStatus, "READY_FOR_PICKUP"), ne(orders.paymentStatus, "PAID"))!),
    db
      .select({ n: count() })
      .from(orders)
      .where(and(eq(orders.orderStatus, "CANCELLED"), sql`${orders.paidAmount} > 0`, inArray(orders.paymentStatus, ["PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED"]))),
  ]);

  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<(typeof STATUSES)[number], number>;
  for (const r of statusRows) byStatus[r.status] = r.n;
  const ordersByDate = new Map(upcomingRows.map((r) => [r.date, r.n]));

  return {
    today,
    byStatus,
    pendingProofs: proofs[0]?.n ?? 0,
    openExceptions: exceptions[0]?.n ?? 0,
    refundCandidates: refundCandidates[0]?.n ?? 0,
    upcoming: dates.map((date) => {
      const f = facts.get(date)!;
      return { date, capacity: f.capacity, used: f.used, isBlocked: f.isBlocked, orders: ordersByDate.get(date) ?? 0 };
    }),
    todayOrders,
    revenue: {
      /** Counted payments received (exceptions excluded, §23) minus completed refunds. */
      receivedTotal: received - (refunded[0]?.total ?? 0),
      receivedThisMonth: receivedMonth,
      outstandingTotal: outstanding[0]?.total ?? 0,
      outstandingOrders: outstanding[0]?.n ?? 0,
    },
    attention: { cashUnconfirmed, readyUnpaid },
  };
}

async function sumPaid(db: Database, since?: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${paymentTransactions.amount}), 0)::int` })
    .from(paymentTransactions)
    .where(
      and(
        eq(paymentTransactions.status, "PAID"),
        eq(paymentTransactions.isException, false),
        since ? gte(paymentTransactions.paidAt, since) : undefined,
      ),
    );
  return row?.total ?? 0;
}

function attentionOrders(db: Database, where: ReturnType<typeof and>) {
  return db
    .select({ id: orders.id, orderNumber: orders.orderNumber, customerName: orders.customerName, pickupDate: orders.pickupDate, paymentStatus: orders.paymentStatus })
    .from(orders)
    .where(where)
    .orderBy(asc(orders.pickupDate))
    .limit(20);
}
