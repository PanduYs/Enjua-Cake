import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { TrackingView } from "@/lib/orders/tracking-view";
import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/client";
import { orderItems, orders, paymentTransactions, refunds } from "@/server/db/schema";
import { normalizeOrderNumber, ORDER_NUMBER_PATTERN } from "@/server/domain/orders/order-number";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { hashTrackingToken, normalizeTrackingToken, trackingTokenMatches, trackingTokenRef } from "@/server/security/tracking-token";

import { expireIfDueFromRow } from "./order-lifecycle";

export type { TrackingView };

/** Technical throttles for access-code guessing (TD-11). Not business rules. */
export const TRACKING_RATE_LIMITS = {
  perIp: { limit: 30, windowSeconds: 15 * 60 },
  perOrder: { limit: 10, windowSeconds: 15 * 60 },
} as const;

const lookupSchema = z.object({
  orderNumber: z.string().max(40).transform(normalizeOrderNumber),
  token: z.string().max(200).transform(normalizeTrackingToken),
});

export type TrackingAccessResult = { ok: true; orderId: string; tokenHash: string } | { ok: false; code: "INVALID" | "RATE_LIMITED" };

// Used when the order number does not exist so both paths do equivalent work.
const DUMMY_HASH = hashTrackingToken("enjua-dummy-token-for-constant-time-path");

/**
 * Order number + access code (FD-66, BR-17, EC-11). Every failure is the same
 * generic result so the response never reveals whether an order number exists.
 */
export async function verifyTrackingAccess(deps: { db: Database; clock: Clock }, input: unknown, clientIp: string): Promise<TrackingAccessResult> {
  const parsed = lookupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID" };
  const { orderNumber, token } = parsed.data;
  const now = deps.clock.now();

  const [byIp, byOrder] = await Promise.all([
    consumeRateLimit(deps.db, `tracking:ip:${clientIp}`, TRACKING_RATE_LIMITS.perIp, now),
    consumeRateLimit(deps.db, `tracking:order:${orderNumber}`, TRACKING_RATE_LIMITS.perOrder, now),
  ]);
  if (!byIp.allowed || !byOrder.allowed) return { ok: false, code: "RATE_LIMITED" };

  const [order] = ORDER_NUMBER_PATTERN.test(orderNumber)
    ? await deps.db.select({ id: orders.id, hash: orders.trackingTokenHash }).from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1)
    : [];
  const matches = trackingTokenMatches(token, order?.hash ?? DUMMY_HASH);
  if (!order || !matches || token.length === 0) return { ok: false, code: "INVALID" };
  return { ok: true, orderId: order.id, tokenHash: order.hash };
}

/**
 * Order details for a verified tracking session. Applies lazy expiry first (TD-07).
 * Returns null if the session's access code is no longer current (regenerated).
 */
export async function getTrackingView(db: Database, session: { orderId: string; tokenRef: string }, clock: Clock): Promise<TrackingView | null> {
  const readOrder = async () => (await db.select().from(orders).where(eq(orders.id, session.orderId)).limit(1))[0];
  let o = await readOrder();
  // Lazy expiry: the locking transaction runs only when this row says the reservation is due.
  if (o && (await expireIfDueFromRow(db, o, clock))) o = await readOrder();
  if (!o || trackingTokenRef(o.trackingTokenHash) !== session.tokenRef) return null;
  const [items, refundRows] = await Promise.all([
    db
      .select({
        name: orderItems.productNameSnapshot,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPriceSnapshot,
        effectiveUnitPrice: orderItems.effectiveUnitPrice,
        lineSubtotal: orderItems.lineSubtotal,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, o.id))
      .orderBy(asc(orderItems.productNameSnapshot)),
    // Same rule as syncOrderPayment: completed refunds of counted payments, not of exceptions.
    db
      .select({ amount: refunds.amount, isException: paymentTransactions.isException })
      .from(refunds)
      .leftJoin(paymentTransactions, eq(refunds.paymentTransactionId, paymentTransactions.id))
      .where(and(eq(refunds.orderId, o.id), eq(refunds.status, "COMPLETED"))),
  ]);
  const refundedAmount = refundRows.filter((r) => r.isException !== true).reduce((sum, r) => sum + r.amount, 0);
  return {
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    orderStatus: o.orderStatus,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    paymentOption: o.paymentOption,
    pickupDate: o.pickupDate,
    createdAt: o.createdAt.toISOString(),
    items,
    subtotal: o.subtotal,
    discountTotal: o.discountTotal,
    grandTotal: o.grandTotal,
    dpAmount: o.dpAmount,
    paidAmount: o.paidAmount,
    remainingAmount: o.remainingAmount,
    refundedAmount,
    reservationExpiresAt: o.orderStatus === "NEW" ? (o.reservationExpiresAt?.toISOString() ?? null) : null,
    cancellation: o.orderStatus !== "CANCELLED" ? null : o.cancellationReason === "PAYMENT_EXPIRED" ? "PAYMENT_EXPIRED" : "ADMIN",
  };
}

/** Order id for a tracking session whose access code is still current (TD-11), else null. */
export async function resolveTrackingSession(db: Database, session: { orderId: string; tokenRef: string } | null): Promise<string | null> {
  if (!session) return null;
  const [o] = await db.select({ hash: orders.trackingTokenHash }).from(orders).where(eq(orders.id, session.orderId)).limit(1);
  return o && trackingTokenRef(o.hash) === session.tokenRef ? session.orderId : null;
}
