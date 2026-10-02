import "server-only";

import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";

import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/client";
import { orders, paymentExceptions, paymentProofs, paymentTransactions, refunds } from "@/server/db/schema";
import { writeAudit } from "@/server/observability/audit";

import { expireLockedOrderIfDue, expireRemainingPaymentsIfDue, transitionLockedOrder } from "./order-lifecycle";
import { lockOrderRow, syncOrderPayment } from "./payments";

export type AdminPaymentError =
  | "NOT_FOUND"
  | "NOT_PENDING"
  | "REASON_REQUIRED"
  | "ORDER_CLOSED"
  | "NOT_CASH"
  | "ALREADY_PAID"
  | "INVALID_AMOUNT"
  | "EXCEEDS_REFUNDABLE"
  | "NOTE_REQUIRED";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: AdminPaymentError };

async function proofOrderId(db: Database, proofId: string) {
  const [row] = await db.select({ orderId: paymentProofs.orderId }).from(paymentProofs).where(eq(paymentProofs.id, proofId)).limit(1);
  return row?.orderId ?? null;
}

type Executor = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Locks a PENDING proof and its WAITING_VERIFICATION transaction (after the order row). */
async function lockProofAndTransaction(tx: Executor, proofId: string) {
  const [proof] = await tx.select().from(paymentProofs).where(eq(paymentProofs.id, proofId)).for("update");
  if (!proof || proof.verificationStatus !== "PENDING") return null;
  const [payment] = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.id, proof.paymentTransactionId)).for("update");
  if (!payment || payment.status !== "WAITING_VERIFICATION") return null;
  return { proof, payment };
}

/**
 * Admin approves a transfer proof (§17, FD-38). Only from PENDING /
 * WAITING_VERIFICATION (§32). A first payment on a NEW order confirms it (§19).
 * A proof approved for an order that was cancelled meanwhile is recorded as a
 * Payment Exception and the order stays cancelled (FD-118).
 */
export async function approvePaymentProof(db: Database, args: { proofId: string; adminId: string }, clock: Clock): Promise<Result<{ orderConfirmed: boolean; exception: boolean }>> {
  const now = clock.now();
  const orderId = await proofOrderId(db, args.proofId);
  if (!orderId) return { ok: false, error: "NOT_FOUND" };
  return db.transaction(async (tx) => {
    const order = await lockOrderRow(tx, orderId);
    if (!order) return { ok: false, error: "NOT_FOUND" } as const;
    const pair = await lockProofAndTransaction(tx, args.proofId);
    if (!pair) return { ok: false, error: "NOT_PENDING" } as const;
    const { proof, payment } = pair;

    const exception = order.orderStatus === "CANCELLED" ? "LATE_PAYMENT_AFTER_CANCEL" : order.paidAmount + payment.amount > order.grandTotal ? "DUPLICATE_PAYMENT" : null;
    await tx
      .update(paymentProofs)
      .set({ verificationStatus: "APPROVED", verifiedByAdminId: args.adminId, verifiedAt: now })
      .where(eq(paymentProofs.id, proof.id));
    await tx
      .update(paymentTransactions)
      .set({ status: "PAID", paidAt: now, verifiedByAdminId: args.adminId, isException: exception !== null, updatedAt: now })
      .where(eq(paymentTransactions.id, payment.id));
    if (exception) await tx.insert(paymentExceptions).values({ paymentTransactionId: payment.id, orderId, kind: exception, createdAt: now });
    await syncOrderPayment(tx, orderId, now);
    await writeAudit(tx, {
      entityType: "payment_transaction",
      entityId: payment.id,
      eventType: "PAYMENT_PROOF_APPROVED",
      oldValue: { status: "WAITING_VERIFICATION" },
      newValue: { orderId, status: "PAID", amount: payment.amount, purpose: payment.purpose, exception },
      actor: { type: "ADMIN", adminId: args.adminId },
    });

    let orderConfirmed = false;
    if (!exception && order.orderStatus === "NEW") {
      // Transfer approval is the admin's confirmation step (§19 table, DI-04).
      const moved = await transitionLockedOrder(tx, { orderId, to: "CONFIRMED", actor: { type: "ADMIN", adminId: args.adminId } }, now);
      orderConfirmed = moved.ok;
    }
    return { ok: true, orderConfirmed, exception: exception !== null } as const;
  });
}

/**
 * Reject (FD-106, FD-120): proof REJECTED with a reason; the transaction returns to
 * WAITING_PAYMENT with its ORIGINAL deadline. If that deadline already passed, the
 * initial payment expires the order now (FD-56) and a remaining payment expires
 * only the transaction (DI-01).
 */
export async function rejectPaymentProof(db: Database, args: { proofId: string; adminId: string; reason: string }, clock: Clock): Promise<Result<{ orderExpired: boolean }>> {
  const now = clock.now();
  const reason = args.reason.trim();
  if (!reason) return { ok: false, error: "REASON_REQUIRED" };
  const orderId = await proofOrderId(db, args.proofId);
  if (!orderId) return { ok: false, error: "NOT_FOUND" };
  return db.transaction(async (tx) => {
    const order = await lockOrderRow(tx, orderId);
    if (!order) return { ok: false, error: "NOT_FOUND" } as const;
    const pair = await lockProofAndTransaction(tx, args.proofId);
    if (!pair) return { ok: false, error: "NOT_PENDING" } as const;
    const { proof, payment } = pair;

    await tx
      .update(paymentProofs)
      .set({ verificationStatus: "REJECTED", rejectionReason: reason, verifiedByAdminId: args.adminId, verifiedAt: now })
      .where(eq(paymentProofs.id, proof.id));
    await tx.update(paymentTransactions).set({ status: "WAITING_PAYMENT", updatedAt: now }).where(eq(paymentTransactions.id, payment.id));
    await syncOrderPayment(tx, orderId, now);
    await writeAudit(tx, {
      entityType: "payment_transaction",
      entityId: payment.id,
      eventType: "PAYMENT_PROOF_REJECTED",
      oldValue: { status: "WAITING_VERIFICATION" },
      newValue: { orderId, status: "WAITING_PAYMENT" },
      reason,
      actor: { type: "ADMIN", adminId: args.adminId },
    });
    const orderExpired = await expireLockedOrderIfDue(tx, orderId, now);
    await expireRemainingPaymentsIfDue(tx, now, orderId);
    await syncOrderPayment(tx, orderId, now);
    return { ok: true, orderExpired } as const;
  });
}

/** "Tandai Lunas (Cash)" at pickup (§18, FD-39): one CASH/FULL transaction for the total. */
export async function markCashPaid(db: Database, args: { orderId: string; adminId: string }, clock: Clock): Promise<Result> {
  const now = clock.now();
  return db.transaction(async (tx) => {
    const order = await lockOrderRow(tx, args.orderId);
    if (!order) return { ok: false, error: "NOT_FOUND" } as const;
    if (order.paymentMethod !== "CASH") return { ok: false, error: "NOT_CASH" } as const;
    if (order.orderStatus === "CANCELLED" || order.orderStatus === "COMPLETED") return { ok: false, error: "ORDER_CLOSED" } as const;
    if (order.paidAmount > 0) return { ok: false, error: "ALREADY_PAID" } as const;

    const [payment] = await tx
      .insert(paymentTransactions)
      .values({
        orderId: order.id,
        purpose: "FULL",
        method: "CASH",
        amount: order.grandTotal,
        status: "PAID",
        paidAt: now,
        verifiedByAdminId: args.adminId,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: paymentTransactions.id });
    await syncOrderPayment(tx, order.id, now);
    await writeAudit(tx, {
      entityType: "payment_transaction",
      entityId: payment!.id,
      eventType: "CASH_MARKED_PAID",
      newValue: { orderId: order.id, amount: order.grandTotal },
      actor: { type: "ADMIN", adminId: args.adminId },
    });
    return { ok: true } as const;
  });
}

export const REFUND_STATUSES = ["PENDING", "COMPLETED"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/**
 * Manual refund record (FD-61–FD-64): amount, status, reason, time, operator.
 * No refund policy is applied — the admin decides; the system only checks the
 * amount does not exceed what was received.
 */
export async function recordRefund(
  db: Database,
  args: { orderId: string; adminId: string; amount: number; reason: string; status: RefundStatus; paymentTransactionId?: string | null },
  clock: Clock,
): Promise<Result<{ refundId: string }>> {
  const now = clock.now();
  const reason = args.reason.trim();
  if (!reason) return { ok: false, error: "REASON_REQUIRED" };
  if (!Number.isInteger(args.amount) || args.amount <= 0) return { ok: false, error: "INVALID_AMOUNT" };
  return db.transaction(async (tx) => {
    const order = await lockOrderRow(tx, args.orderId);
    if (!order) return { ok: false, error: "NOT_FOUND" } as const;
    const refundable = await refundableAmount(tx, order.id, args.paymentTransactionId ?? null);
    if (refundable === null) return { ok: false, error: "NOT_FOUND" } as const;
    if (args.amount > refundable) return { ok: false, error: "EXCEEDS_REFUNDABLE" } as const;

    const [row] = await tx
      .insert(refunds)
      .values({
        orderId: order.id,
        paymentTransactionId: args.paymentTransactionId ?? null,
        amount: args.amount,
        status: args.status,
        reason,
        refundedAt: args.status === "COMPLETED" ? now : null,
        recordedByAdminId: args.adminId,
        createdAt: now,
      })
      .returning({ id: refunds.id });
    await syncOrderPayment(tx, order.id, now);
    await writeAudit(tx, {
      entityType: "order",
      entityId: order.id,
      eventType: "REFUND_RECORDED",
      newValue: { refundId: row!.id, amount: args.amount, status: args.status, paymentTransactionId: args.paymentTransactionId ?? null },
      reason,
      actor: { type: "ADMIN", adminId: args.adminId },
    });
    return { ok: true, refundId: row!.id } as const;
  });
}

export async function completeRefund(db: Database, args: { refundId: string; adminId: string }, clock: Clock): Promise<Result> {
  const now = clock.now();
  const [ref] = await db.select({ orderId: refunds.orderId }).from(refunds).where(eq(refunds.id, args.refundId)).limit(1);
  if (!ref) return { ok: false, error: "NOT_FOUND" };
  return db.transaction(async (tx) => {
    await lockOrderRow(tx, ref.orderId);
    const updated = await tx
      .update(refunds)
      .set({ status: "COMPLETED", refundedAt: now })
      .where(and(eq(refunds.id, args.refundId), eq(refunds.status, "PENDING")))
      .returning({ id: refunds.id });
    if (updated.length === 0) return { ok: false, error: "NOT_PENDING" } as const;
    await syncOrderPayment(tx, ref.orderId, now);
    await writeAudit(tx, {
      entityType: "order",
      entityId: ref.orderId,
      eventType: "REFUND_COMPLETED",
      newValue: { refundId: args.refundId },
      actor: { type: "ADMIN", adminId: args.adminId },
    });
    return { ok: true } as const;
  });
}

/**
 * Received minus already-recorded refunds. Exception money (§23) and counted order
 * money are kept apart so the same Rupiah can never be refunded twice: a refund for
 * an exception transaction is limited to that transaction; an order-level refund
 * is limited to counted (non-exception) payments minus refunds not tied to an
 * exception transaction.
 */
async function refundableAmount(tx: Executor, orderId: string, transactionId: string | null): Promise<number | null> {
  const paid = await tx
    .select({ id: paymentTransactions.id, amount: paymentTransactions.amount, isException: paymentTransactions.isException })
    .from(paymentTransactions)
    .where(and(eq(paymentTransactions.orderId, orderId), eq(paymentTransactions.status, "PAID")));
  const existing = await tx
    .select({ amount: refunds.amount, transactionId: refunds.paymentTransactionId })
    .from(refunds)
    .where(eq(refunds.orderId, orderId));
  const exceptionIds = new Set(paid.filter((p) => p.isException).map((p) => p.id));

  const counted = paid.filter((p) => !p.isException).reduce((s, p) => s + p.amount, 0);
  const refundedCounted = existing.filter((r) => !r.transactionId || !exceptionIds.has(r.transactionId)).reduce((s, r) => s + r.amount, 0);
  const orderLevel = counted - refundedCounted;
  if (!transactionId) return orderLevel;

  const target = paid.find((p) => p.id === transactionId);
  if (!target) return null;
  const refundedTarget = existing.filter((r) => r.transactionId === transactionId).reduce((s, r) => s + r.amount, 0);
  const perTransaction = target.amount - refundedTarget;
  // A counted transaction is also bounded by what is still refundable on the order.
  return target.isException ? perTransaction : Math.min(perTransaction, orderLevel);
}

/**
 * Payment Exception resolution (§23): record a refund or close manually with a
 * note. There is no reinstate action — a cancelled order stays cancelled (FD-118).
 */
export async function resolvePaymentException(
  db: Database,
  args: { exceptionId: string; adminId: string; resolution: "REFUNDED" | "RESOLVED_MANUALLY"; note: string; refundStatus?: RefundStatus },
  clock: Clock,
): Promise<Result> {
  const now = clock.now();
  const note = args.note.trim();
  if (!note) return { ok: false, error: "NOTE_REQUIRED" };
  const [exc] = await db.select().from(paymentExceptions).where(eq(paymentExceptions.id, args.exceptionId)).limit(1);
  if (!exc) return { ok: false, error: "NOT_FOUND" };

  if (args.resolution === "REFUNDED") {
    const [payment] = await db.select({ amount: paymentTransactions.amount }).from(paymentTransactions).where(eq(paymentTransactions.id, exc.paymentTransactionId));
    const refund = await recordRefund(
      db,
      { orderId: exc.orderId, adminId: args.adminId, amount: payment!.amount, reason: note, status: args.refundStatus ?? "COMPLETED", paymentTransactionId: exc.paymentTransactionId },
      clock,
    );
    if (!refund.ok && refund.error !== "EXCEEDS_REFUNDABLE") return refund;
  }

  return db.transaction(async (tx) => {
    await lockOrderRow(tx, exc.orderId);
    const updated = await tx
      .update(paymentExceptions)
      .set({ status: "RESOLVED", resolution: args.resolution, resolutionNote: note, resolvedByAdminId: args.adminId, resolvedAt: now })
      .where(and(eq(paymentExceptions.id, exc.id), eq(paymentExceptions.status, "OPEN")))
      .returning({ id: paymentExceptions.id });
    if (updated.length === 0) return { ok: false, error: "NOT_PENDING" } as const;
    await writeAudit(tx, {
      entityType: "order",
      entityId: exc.orderId,
      eventType: "PAYMENT_EXCEPTION_RESOLVED",
      newValue: { exceptionId: exc.id, kind: exc.kind, resolution: args.resolution },
      reason: note,
      actor: { type: "ADMIN", adminId: args.adminId },
    });
    return { ok: true } as const;
  });
}

/** Admin "Pembayaran" queue (§26): proofs to verify, open exceptions, cancelled orders holding money. */
export async function getPaymentQueue(db: Database) {
  const [proofs, exceptions, refundCandidates] = await Promise.all([
    db
      .select({
        proofId: paymentProofs.id,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        customerName: orders.customerName,
        amount: paymentTransactions.amount,
        purpose: paymentTransactions.purpose,
        uploadedAt: paymentProofs.uploadedAt,
      })
      .from(paymentProofs)
      .innerJoin(paymentTransactions, eq(paymentProofs.paymentTransactionId, paymentTransactions.id))
      .innerJoin(orders, eq(paymentProofs.orderId, orders.id))
      .where(eq(paymentProofs.verificationStatus, "PENDING"))
      .orderBy(asc(paymentProofs.uploadedAt)),
    db
      .select({
        exceptionId: paymentExceptions.id,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        kind: paymentExceptions.kind,
        amount: paymentTransactions.amount,
        createdAt: paymentExceptions.createdAt,
      })
      .from(paymentExceptions)
      .innerJoin(paymentTransactions, eq(paymentExceptions.paymentTransactionId, paymentTransactions.id))
      .innerJoin(orders, eq(paymentExceptions.orderId, orders.id))
      .where(eq(paymentExceptions.status, "OPEN"))
      .orderBy(asc(paymentExceptions.createdAt)),
    // Cancelled orders that still hold counted payments → refund to be recorded (§19).
    db
      .select({ orderId: orders.id, orderNumber: orders.orderNumber, paidAmount: orders.paidAmount, paymentStatus: orders.paymentStatus })
      .from(orders)
      .where(and(eq(orders.orderStatus, "CANCELLED"), gt(orders.paidAmount, 0), inArray(orders.paymentStatus, ["PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED"])))
      .orderBy(desc(orders.updatedAt)),
  ]);
  return { proofs, exceptions, refundCandidates };
}

/** Payment section of the admin order detail. */
export async function getAdminPaymentDetail(db: Database, orderId: string) {
  const [proofs, exceptions, refundRows] = await Promise.all([
    db.select().from(paymentProofs).where(eq(paymentProofs.orderId, orderId)).orderBy(desc(paymentProofs.uploadedAt)),
    db.select().from(paymentExceptions).where(eq(paymentExceptions.orderId, orderId)).orderBy(desc(paymentExceptions.createdAt)),
    db.select().from(refunds).where(eq(refunds.orderId, orderId)).orderBy(desc(refunds.createdAt)),
  ]);
  return { proofs, exceptions, refunds: refundRows };
}

/** Stream metadata for an admin-only proof download (FD-51). */
export async function getProofFile(db: Database, proofId: string) {
  const [row] = await db
    .select({ storageKey: paymentProofs.storageKey, mimeType: paymentProofs.mimeType, orderId: paymentProofs.orderId })
    .from(paymentProofs)
    .where(eq(paymentProofs.id, proofId))
    .limit(1);
  return row ?? null;
}
