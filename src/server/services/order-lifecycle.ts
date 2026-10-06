import "server-only";

import { and, eq, inArray, lte, ne, sql } from "drizzle-orm";

import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/client";
import { orders, paymentTransactions } from "@/server/db/schema";
import { checkTransition, type OrderStatus, type TransitionError } from "@/server/domain/orders/state-machine";
import { writeAudit, type AuditActor } from "@/server/observability/audit";
import { generateTrackingToken, hashTrackingToken } from "@/server/security/tracking-token";

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const lockedOrderColumns = {
  id: orders.id,
  orderStatus: orders.orderStatus,
  paymentStatus: orders.paymentStatus,
  paymentMethod: orders.paymentMethod,
  paidAmount: orders.paidAmount,
  reservationExpiresAt: orders.reservationExpiresAt,
};

async function lockOrder(tx: Tx, orderId: string) {
  const [row] = await tx.select(lockedOrderColumns).from(orders).where(eq(orders.id, orderId)).for("update");
  return row ?? null;
}

/**
 * An unpaid QRIS/Transfer order whose reservation has run out (FD-14, FD-56, FD-120).
 * Not Cash (FD-57), not once any payment is confirmed (DI-01), not while a proof
 * waits for verification (FD-120).
 */
function isExpirable(
  o: {
    orderStatus: string;
    paymentMethod: string;
    paidAmount: number;
    paymentStatus: string;
    reservationExpiresAt: Date | null;
  },
  now: Date,
) {
  return (
    o.orderStatus === "NEW" &&
    o.paymentMethod !== "CASH" &&
    o.paidAmount === 0 &&
    (o.paymentStatus === "WAITING_PAYMENT" || o.paymentStatus === "FAILED") &&
    o.reservationExpiresAt !== null &&
    o.reservationExpiresAt.getTime() <= now.getTime()
  );
}

/**
 * Expires a locked order if due (caller holds the row lock). Used inside the
 * webhook / proof-review transactions so they see the final state (§16 step 6).
 */
export async function expireLockedOrderIfDue(tx: Tx, orderId: string, now: Date): Promise<boolean> {
  const order = await lockOrder(tx, orderId);
  if (!order || !isExpirable(order, now)) return false;
  if (checkTransition("NEW", "CANCELLED", "SYSTEM", { paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus, systemReason: "PAYMENT_EXPIRED" })) return false;

  await tx
    .update(orders)
    .set({
      orderStatus: "CANCELLED",
      paymentStatus: "EXPIRED",
      cancellationReason: "PAYMENT_EXPIRED",
      cancelledByType: "SYSTEM",
      cancelledAt: now,
      updatedAt: now,
    })
    .where(eq(orders.id, orderId));
  await tx
    .update(paymentTransactions)
    .set({ status: "EXPIRED", updatedAt: now })
    .where(and(eq(paymentTransactions.orderId, orderId), inArray(paymentTransactions.status, ["WAITING_PAYMENT", "FAILED"])));
  await writeAudit(tx, {
    entityType: "order",
    entityId: orderId,
    eventType: "ORDER_STATUS_CHANGED",
    oldValue: { orderStatus: "NEW", paymentStatus: order.paymentStatus },
    newValue: { orderStatus: "CANCELLED", paymentStatus: "EXPIRED" },
    reason: "PAYMENT_EXPIRED",
    actor: { type: "SYSTEM" },
  });
  return true;
}

/**
 * Read-path lazy expiry (TD-07) for an order row the caller has just read: opens the locking
 * transaction only when that row is due, so ordinary views write nothing. The transaction
 * re-checks the same rule under the row lock. Returns true when it expired the order.
 */
export async function expireIfDueFromRow(db: Database, order: Parameters<typeof isExpirable>[0] & { id: string }, clock: Clock): Promise<boolean> {
  if (!isExpirable(order, clock.now())) return false;
  return expireIfDue(db, order.id, clock);
}

/** Same rule as expireRemainingPaymentsIfDue, for transaction rows already read. */
export function hasDueRemainingPayment(txs: ReadonlyArray<{ purpose: string; status: string; expiresAt: Date | null }>, now: Date): boolean {
  return txs.some((t) => t.purpose === "REMAINING" && t.status === "WAITING_PAYMENT" && t.expiresAt !== null && t.expiresAt.getTime() <= now.getTime());
}

/** Idempotent; safe to call from any read path (TD-07). Returns true when it expired the order. */
export async function expireIfDue(db: Database, orderId: string, clock: Clock): Promise<boolean> {
  const now = clock.now();
  return db.transaction((tx) => expireLockedOrderIfDue(tx, orderId, now));
}

/**
 * Remaining-payment expiry (TD-09, DI-01): only the transaction becomes EXPIRED;
 * the order, its status, and its slot are never touched.
 */
export async function expireRemainingPaymentsIfDue(db: Pick<Database, "update">, now: Date, orderId?: string): Promise<number> {
  const rows = await db
    .update(paymentTransactions)
    .set({ status: "EXPIRED", updatedAt: now })
    .where(
      and(
        eq(paymentTransactions.purpose, "REMAINING"),
        eq(paymentTransactions.status, "WAITING_PAYMENT"),
        lte(paymentTransactions.expiresAt, now),
        orderId ? eq(paymentTransactions.orderId, orderId) : undefined,
      ),
    )
    .returning({ id: paymentTransactions.id });
  return rows.length;
}

/**
 * Sweeper (TD-07, TD-09): finalizes expired reservations and, separately, expires
 * overdue remaining-payment transactions without touching their orders (DI-01).
 */
export async function expireDueReservations(db: Database, clock: Clock, limit = 200): Promise<{ ordersExpired: number; remainingPaymentsExpired: number }> {
  const now = clock.now();
  const due = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.orderStatus, "NEW"),
        ne(orders.paymentMethod, "CASH"),
        eq(orders.paidAmount, 0),
        inArray(orders.paymentStatus, ["WAITING_PAYMENT", "FAILED"]),
        lte(orders.reservationExpiresAt, now),
      ),
    )
    .limit(limit);
  let ordersExpired = 0;
  for (const { id } of due) if (await expireIfDue(db, id, clock)) ordersExpired++;

  const remainingPaymentsExpired = await expireRemainingPaymentsIfDue(db, now);
  return { ordersExpired, remainingPaymentsExpired };
}

export type TransitionResult = { ok: true; from: OrderStatus; to: OrderStatus } | { ok: false; error: TransitionError | "NOT_FOUND" | "STALE_STATUS" };

/**
 * The only way to change order_status (TD-14). Locks the order row, checks the
 * state machine with current payment facts, applies side effects, and audits.
 */
export async function transitionOrder(
  db: Database,
  args: {
    orderId: string;
    to: OrderStatus;
    actor: Extract<AuditActor, { type: "ADMIN" }> | { type: "SYSTEM" };
    reason?: string | null;
    expectedFrom?: OrderStatus;
  },
  clock: Clock,
): Promise<TransitionResult> {
  const now = clock.now();
  return db.transaction((tx) => transitionLockedOrder(tx, args, now));
}

type TransitionArgs = Parameters<typeof transitionOrder>[1];

/** transitionOrder inside an existing transaction (payment approval, webhook). */
export async function transitionLockedOrder(tx: Tx, args: TransitionArgs, now: Date): Promise<TransitionResult> {
  const order = await lockOrder(tx, args.orderId);
  if (!order) return { ok: false, error: "NOT_FOUND" } as const;
  if (args.expectedFrom && order.orderStatus !== args.expectedFrom) return { ok: false, error: "STALE_STATUS" } as const;

  const reason = args.reason?.trim() || null;
  const error = checkTransition(order.orderStatus, args.to, args.actor.type, {
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    reason,
  });
  if (error) return { ok: false, error } as const;

  await tx
    .update(orders)
    .set({
      orderStatus: args.to,
      updatedAt: now,
      ...(args.to === "CANCELLED"
        ? {
            cancellationReason: reason,
            cancelledByType: args.actor.type,
            cancelledByAdminId: args.actor.type === "ADMIN" ? args.actor.adminId : null,
            cancelledAt: now,
          }
        : {}),
    })
    .where(eq(orders.id, args.orderId));

  // Cancelling releases the slot implicitly (cancelled orders are not active, §13.2).
  if (args.to === "CANCELLED") {
    await tx
      .update(paymentTransactions)
      .set({ status: "VOIDED", updatedAt: now })
      .where(and(eq(paymentTransactions.orderId, args.orderId), eq(paymentTransactions.status, "WAITING_PAYMENT")));
  }

  await writeAudit(tx, {
    entityType: "order",
    entityId: args.orderId,
    eventType: "ORDER_STATUS_CHANGED",
    oldValue: { orderStatus: order.orderStatus },
    newValue: { orderStatus: args.to },
    reason,
    actor: args.actor,
  });
  return { ok: true, from: order.orderStatus, to: args.to } as const;
}

/**
 * Admin recovery for a lost access code (FD-72, DI-05): issues a new code, which
 * invalidates the old one. The plaintext is returned once for manual delivery.
 */
export async function regenerateTrackingToken(db: Database, orderId: string, adminId: string): Promise<string | null> {
  const token = generateTrackingToken();
  const updated = await db
    .update(orders)
    .set({ trackingTokenHash: hashTrackingToken(token), updatedAt: sql`now()` })
    .where(eq(orders.id, orderId))
    .returning({ id: orders.id });
  if (updated.length === 0) return null;
  await writeAudit(db, {
    entityType: "order",
    entityId: orderId,
    eventType: "TRACKING_TOKEN_REGENERATED",
    actor: { type: "ADMIN", adminId },
  });
  return token;
}
