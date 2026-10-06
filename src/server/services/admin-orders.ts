import "server-only";

import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";

import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/client";
import { admins, auditLogs, orderItems, orderOverrides, orders, paymentTransactions } from "@/server/db/schema";
import { allowedTransitions, candidateTransitions, type OrderStatus } from "@/server/domain/orders/state-machine";

import { expireDueReservations, expireIfDueFromRow, expireRemainingPaymentsIfDue, hasDueRemainingPayment } from "./order-lifecycle";
import { getAdminPaymentDetail } from "./payment-admin";

export const ADMIN_ORDER_STATUSES = ["NEW", "CONFIRMED", "PROCESSING", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"] as const;

export async function listAdminOrders(db: Database, clock: Clock, filters: { status?: OrderStatus; pickupDate?: string; paymentMethod?: "QRIS" | "BANK_TRANSFER" | "CASH" } = {}) {
  await expireDueReservations(db, clock);
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(orders.orderStatus, filters.status));
  if (filters.pickupDate) conditions.push(eq(orders.pickupDate, filters.pickupDate));
  if (filters.paymentMethod) conditions.push(eq(orders.paymentMethod, filters.paymentMethod));
  return db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      pickupDate: orders.pickupDate,
      orderStatus: orders.orderStatus,
      paymentStatus: orders.paymentStatus,
      paymentMethod: orders.paymentMethod,
      grandTotal: orders.grandTotal,
      source: orders.source,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(200);
}

export async function getAdminOrderDetail(db: Database, orderId: string, clock: Clock) {
  const readOrder = async () => (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
  let order = await readOrder();
  if (!order) return null;
  // Lazy expiry: the locking transaction runs only when this row says the reservation is due.
  if (await expireIfDueFromRow(db, order, clock)) order = (await readOrder())!;

  const readTransactions = () => db.select().from(paymentTransactions).where(eq(paymentTransactions.orderId, orderId)).orderBy(asc(paymentTransactions.createdAt));
  const [items, readTxs, audit, payments, overrides, cancelledByRows] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.productNameSnapshot)),
    readTransactions(),
    db
      .select({
        id: auditLogs.id,
        eventType: auditLogs.eventType,
        oldValue: auditLogs.oldValue,
        newValue: auditLogs.newValue,
        reason: auditLogs.reason,
        actorType: auditLogs.actorType,
        actorName: admins.name,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(admins, eq(auditLogs.actorAdminId, admins.id))
      .where(
        or(
          and(eq(auditLogs.entityType, "order"), eq(auditLogs.entityId, orderId)),
          // Payment events are logged per transaction and carry their order id.
          and(eq(auditLogs.entityType, "payment_transaction"), sql`${auditLogs.newValue}->>'orderId' = ${orderId}`),
        ),
      )
      .orderBy(asc(auditLogs.id)),
    getAdminPaymentDetail(db, orderId),
    db
      .select({ id: orderOverrides.id, type: orderOverrides.overrideType, before: orderOverrides.valueBefore, after: orderOverrides.valueAfter, reason: orderOverrides.reason, adminName: admins.name, createdAt: orderOverrides.createdAt })
      .from(orderOverrides)
      .leftJoin(admins, eq(orderOverrides.adminId, admins.id))
      .where(eq(orderOverrides.orderId, orderId))
      .orderBy(asc(orderOverrides.createdAt)),
    order.cancelledByAdminId ? db.select({ name: admins.name }).from(admins).where(inArray(admins.id, [order.cancelledByAdminId])).limit(1) : Promise.resolve([]),
  ]);
  // Remaining-payment expiry (TD-09): write only when one of these rows is actually overdue.
  const now = clock.now();
  const transactions = hasDueRemainingPayment(readTxs, now) && (await expireRemainingPaymentsIfDue(db, now, orderId)) > 0 ? await readTransactions() : readTxs;
  const cancelledBy = cancelledByRows[0]?.name ?? null;

  const ctx = {
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
  };
  return {
    order,
    items,
    transactions,
    payments,
    overrides,
    audit,
    cancelledBy,
    /** Targets the admin may choose now (FD-116); shown in the UI. */
    allowed: allowedTransitions(order.orderStatus, "ADMIN", ctx),
    /** Targets that exist in the table but are blocked by a guard (e.g. Selesai before Lunas). */
    blocked: candidateTransitions(order.orderStatus, "ADMIN").filter((t) => !allowedTransitions(order.orderStatus, "ADMIN", ctx).includes(t)),
  };
}
