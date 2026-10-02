import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/client";
import { paymentExceptions, paymentTransactions, paymentWebhookEvents } from "@/server/db/schema";
import { writeAudit } from "@/server/observability/audit";
import { isPaymentProviderError, type PaymentProvider, type ProviderTransactionStatus } from "@/server/payments/types";

import { expireLockedOrderIfDue, transitionLockedOrder, type Tx } from "./order-lifecycle";
import { lockOrderRow, syncOrderPayment } from "./payments";

export type WebhookOutcome =
  | "INVALID_SIGNATURE"
  | "DUPLICATE_EVENT"
  | "UNKNOWN_REFERENCE"
  | "STATUS_NOT_CONFIRMED"
  | "ALREADY_PROCESSED"
  | "PAID"
  | "PAID_ORDER_CONFIRMED"
  | "EXCEPTION_LATE_PAYMENT"
  | "EXCEPTION_AMOUNT_MISMATCH"
  | "EXCEPTION_DUPLICATE_PAYMENT"
  | "FAILED"
  | "EXPIRED"
  | "IGNORED";

/** HTTP status for the gateway: non-2xx only when a retry can help (§16 step 9). */
export interface WebhookResponse {
  status: 200 | 401 | 503;
  outcome: WebhookOutcome | "PROVIDER_UNAVAILABLE";
}

/**
 * QRIS webhook (IMPLEMENTATION-PLAN §16, FD-37, FD-107, FD-111, FD-112, EC-05, EC-06).
 * 1. verify signature; 2. re-check status with the provider API (the webhook body
 * alone is never trusted); 3. idempotency by (provider, event key), recorded in the
 * same DB transaction as the effect so a crash never swallows an event;
 * 4–8. apply under row locks (order → transaction).
 */
export async function processPaymentWebhook(deps: { db: Database; clock: Clock; provider: PaymentProvider }, request: Request): Promise<WebhookResponse> {
  const now = deps.clock.now();
  const parsed = await deps.provider.parseAndVerifyWebhook(request);
  if (!parsed.valid) {
    await deps.db.insert(paymentWebhookEvents).values({
      provider: deps.provider.name,
      providerEventKey: `invalid:${randomUUID()}`,
      payloadHash: parsed.payloadHash ?? "none",
      signatureValid: false,
      processingResult: parsed.reason,
      receivedAt: now,
    });
    return { status: 401, outcome: "INVALID_SIGNATURE" };
  }
  const event = parsed.event;

  // Defense in depth: the provider's own API decides the status and amount.
  let confirmed: ProviderTransactionStatus | null;
  try {
    confirmed = await deps.provider.getTransactionStatus(event.providerReference);
  } catch (error) {
    if (isPaymentProviderError(error)) return { status: 503, outcome: "PROVIDER_UNAVAILABLE" };
    throw error;
  }

  const outcome = await deps.db.transaction(async (tx) => {
    // Concurrent duplicates block on the unique index until the first commits, then conflict.
    const inserted = await tx
      .insert(paymentWebhookEvents)
      .values({ provider: deps.provider.name, providerEventKey: event.providerEventKey, payloadHash: event.payloadHash, signatureValid: true, receivedAt: now })
      .onConflictDoNothing()
      .returning({ id: paymentWebhookEvents.id });
    if (inserted.length === 0) return "DUPLICATE_EVENT" as const;

    const result = await applyConfirmedStatus(tx, deps.provider.name, event.providerReference, confirmed, event.status, now);
    await tx
      .update(paymentWebhookEvents)
      .set({ processingResult: result, processedAt: now })
      .where(eq(paymentWebhookEvents.id, inserted[0]!.id));
    return result;
  });
  return { status: 200, outcome };
}

async function applyConfirmedStatus(
  tx: Tx,
  provider: string,
  providerReference: string,
  confirmed: ProviderTransactionStatus | null,
  claimed: ProviderTransactionStatus["status"],
  now: Date,
): Promise<WebhookOutcome> {
  if (!confirmed) return "UNKNOWN_REFERENCE";
  // A webhook that claims more than the provider confirms is not applied.
  if (claimed === "PAID" && confirmed.status !== "PAID") return "STATUS_NOT_CONFIRMED";

  const [ref] = await tx
    .select({ id: paymentTransactions.id, orderId: paymentTransactions.orderId })
    .from(paymentTransactions)
    .where(and(eq(paymentTransactions.provider, provider), eq(paymentTransactions.providerReference, providerReference)));
  if (!ref) return "UNKNOWN_REFERENCE";

  // Lock order first, then the transaction (same order as every other payment path).
  await lockOrderRow(tx, ref.orderId);
  await expireLockedOrderIfDue(tx, ref.orderId, now); // §16 step 6
  const order = (await lockOrderRow(tx, ref.orderId))!;
  const [payment] = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.id, ref.id)).for("update");
  if (!payment) return "UNKNOWN_REFERENCE";

  if (confirmed.status === "PAID") {
    if (payment.status === "PAID") return "ALREADY_PROCESSED"; // EC-05
    const paidAt = confirmed.paidAt ?? now;

    let exception: "LATE_PAYMENT_AFTER_CANCEL" | "AMOUNT_MISMATCH" | "DUPLICATE_PAYMENT" | null = null;
    if (order.orderStatus === "CANCELLED") exception = "LATE_PAYMENT_AFTER_CANCEL"; // FD-107, FD-118: never reinstated
    else if (confirmed.amount !== payment.amount) exception = "AMOUNT_MISMATCH"; // EC-06, TD-13
    else if (order.paidAmount + payment.amount > order.grandTotal) exception = "DUPLICATE_PAYMENT"; // TD-13, TD-20

    await tx
      .update(paymentTransactions)
      .set({ status: "PAID", paidAt, isException: exception !== null, updatedAt: now })
      .where(eq(paymentTransactions.id, payment.id));

    if (exception) {
      await tx.insert(paymentExceptions).values({ paymentTransactionId: payment.id, orderId: order.id, kind: exception, createdAt: now });
      await writeAudit(tx, {
        entityType: "payment_transaction",
        entityId: payment.id,
        eventType: "PAYMENT_EXCEPTION_OPENED",
        newValue: { orderId: order.id, kind: exception, amount: confirmed.amount },
        actor: { type: "SYSTEM" },
      });
      return exception === "LATE_PAYMENT_AFTER_CANCEL"
        ? "EXCEPTION_LATE_PAYMENT"
        : exception === "AMOUNT_MISMATCH"
          ? "EXCEPTION_AMOUNT_MISMATCH"
          : "EXCEPTION_DUPLICATE_PAYMENT";
    }

    await syncOrderPayment(tx, order.id, now);
    await writeAudit(tx, {
      entityType: "payment_transaction",
      entityId: payment.id,
      eventType: "PAYMENT_CONFIRMED",
      oldValue: { status: payment.status },
      newValue: { orderId: order.id, status: "PAID", amount: payment.amount, purpose: payment.purpose },
      actor: { type: "SYSTEM" },
    });
    // QRIS: confirmation only via this verified path, by SYSTEM (FD-111, DI-04).
    if (order.orderStatus === "NEW") {
      const moved = await transitionLockedOrder(tx, { orderId: order.id, to: "CONFIRMED", actor: { type: "SYSTEM" } }, now);
      if (moved.ok) return "PAID_ORDER_CONFIRMED";
    }
    return "PAID";
  }

  if (confirmed.status === "FAILED" || confirmed.status === "EXPIRED") {
    if (payment.status !== "WAITING_PAYMENT") return "IGNORED";
    // Only this transaction changes; the order stays, and a new QRIS may be created (FD-112, DI-08).
    await tx.update(paymentTransactions).set({ status: confirmed.status, updatedAt: now }).where(eq(paymentTransactions.id, payment.id));
    await syncOrderPayment(tx, order.id, now);
    await writeAudit(tx, {
      entityType: "payment_transaction",
      entityId: payment.id,
      eventType: confirmed.status === "FAILED" ? "PAYMENT_FAILED" : "PAYMENT_EXPIRED",
      newValue: { orderId: order.id },
      actor: { type: "SYSTEM" },
    });
    return confirmed.status;
  }
  return "IGNORED";
}

/** For tests/monitoring: count of webhook events by result. */
export async function countWebhookEvents(db: Database, result: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(paymentWebhookEvents).where(eq(paymentWebhookEvents.processingResult, result));
  return row?.n ?? 0;
}
