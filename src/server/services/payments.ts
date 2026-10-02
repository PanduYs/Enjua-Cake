import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq, inArray } from "drizzle-orm";

import type { ActiveQris, CustomerPaymentState } from "@/lib/orders/payment-state";
import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/client";
import { orders, paymentProofs, paymentTransactions, refunds } from "@/server/db/schema";
import { derivePaymentStatus, initialQrExpiry, paidAmountOf } from "@/server/domain/payments/payment-status";
import { PROOF_EXTENSION, validateProofFile, type ProofFileError } from "@/server/domain/payments/proof-file";
import { writeAudit, type AuditActor } from "@/server/observability/audit";
import { logger } from "@/server/observability/logger";
import type { PaymentProvider } from "@/server/payments/types";
import { consumeRateLimit } from "@/server/security/rate-limit";
import type { PrivateBucket } from "@/server/storage/types";

import { expireIfDue, expireRemainingPaymentsIfDue, type Tx } from "./order-lifecycle";
import { getSettings, type Settings } from "./settings";

export type { ActiveQris, CustomerPaymentState };

/**
 * Lock order (IMPLEMENTATION-PLAN §31): every payment mutation locks the ORDER row
 * first and only then its transaction rows, the same order Phase 4's transitions
 * and expiry use, so concurrent webhook / expiry / admin actions cannot deadlock.
 */
export async function lockOrderRow(tx: Tx, orderId: string) {
  const [row] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  return row ?? null;
}

/** Recomputes paid/remaining/payment_status from transactions + refunds in the same DB transaction (§14.1, §20.2). */
export async function syncOrderPayment(tx: Tx, orderId: string, now: Date) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;
  const txs = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.orderId, orderId));
  const exceptionIds = new Set(txs.filter((t) => t.isException).map((t) => t.id));
  const refundRows = await tx.select().from(refunds).where(and(eq(refunds.orderId, orderId), eq(refunds.status, "COMPLETED")));
  const refundedAmount = refundRows.filter((r) => !r.paymentTransactionId || !exceptionIds.has(r.paymentTransactionId)).reduce((s, r) => s + r.amount, 0);

  const facts = {
    grandTotal: order.grandTotal,
    paymentMethod: order.paymentMethod,
    orderExpired: order.orderStatus === "CANCELLED" && order.cancellationReason === "PAYMENT_EXPIRED",
    transactions: txs,
    refundedAmount,
  };
  const paidAmount = paidAmountOf(facts);
  const paymentStatus = derivePaymentStatus(facts, now);
  const remainingAmount = Math.max(order.grandTotal - paidAmount, 0);
  if (order.paidAmount !== paidAmount || order.paymentStatus !== paymentStatus || order.remainingAmount !== remainingAmount) {
    await tx.update(orders).set({ paidAmount, paymentStatus, remainingAmount, updatedAt: now }).where(eq(orders.id, orderId));
  }
  return { paidAmount, paymentStatus, remainingAmount };
}

export type PaymentActionError =
  | "NOT_FOUND"
  | "ORDER_CLOSED"
  | "RESERVATION_EXPIRED"
  | "ALREADY_PAID"
  | "METHOD_NOT_AVAILABLE"
  | "PROOF_UNDER_REVIEW"
  | "PROVIDER_UNAVAILABLE"
  | "RATE_LIMITED"
  | "NO_PENDING_TRANSFER"
  | "PAYMENT_EXPIRED"
  | ProofFileError;


/** Technical throttles (§30); not business rules. */
export const PAYMENT_RATE_LIMITS = {
  qrisPerOrder: { limit: 20, windowSeconds: 15 * 60 },
  proofPerOrder: { limit: 10, windowSeconds: 60 * 60 },
} as const;

export interface PaymentDeps {
  db: Database;
  clock: Clock;
  provider: PaymentProvider;
}

class ProviderFailure extends Error {}

/**
 * Customer asks for a QRIS (tracking page). Initial payment for QRIS orders
 * (DP/FULL, QR valid until reservation − buffer, TD-08) or remaining payment of a
 * DP order (own duration, TD-09). Re-uses a still-valid pending QR; otherwise
 * creates a new transaction and retires the old pending ones (TD-20, FD-112).
 * Never marks anything paid — only a verified webhook does (FD-111).
 */
export async function requestQrisPayment(deps: PaymentDeps, orderId: string): Promise<{ ok: true; qris: ActiveQris } | { ok: false; error: PaymentActionError }> {
  const now = deps.clock.now();
  await expireIfDue(deps.db, orderId, deps.clock);
  await expireRemainingPaymentsIfDue(deps.db, now, orderId);
  const limit = await consumeRateLimit(deps.db, `qris:order:${orderId}`, PAYMENT_RATE_LIMITS.qrisPerOrder, now);
  if (!limit.allowed) return { ok: false, error: "RATE_LIMITED" };
  const settings = await getSettings(deps.db);

  const retired: string[] = [];
  try {
    const result = await deps.db.transaction(async (tx) => {
      const order = await lockOrderRow(tx, orderId);
      if (!order) return { ok: false, error: "NOT_FOUND" } as const;
      const plan = planPayment(order, settings, now, "QRIS");
      if (!plan.ok) return plan;

      const txs = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.orderId, orderId)).for("update");
      if (txs.some((t) => t.status === "WAITING_VERIFICATION" && !t.isException)) return { ok: false, error: "PROOF_UNDER_REVIEW" } as const;

      const purposes = plan.purpose === "REMAINING" ? ["REMAINING"] : ["DP", "FULL"];
      const pending = txs.filter((t) => t.status === "WAITING_PAYMENT" && purposes.includes(t.purpose));
      const reusable = pending.find(
        (t) => t.method === "QRIS" && t.amount === plan.amount && t.qrString && t.providerReference && t.expiresAt && t.expiresAt.getTime() > now.getTime(),
      );
      if (reusable) {
        return { ok: true, qris: toActive(reusable) } as const;
      }

      // The checkout-created initial transaction has no QR yet: attach one to it.
      const attachable = pending.find((t) => t.method === "QRIS" && !t.providerReference && t.amount === plan.amount && plan.purpose !== "REMAINING");
      const transactionId = attachable?.id ?? randomUUID();
      const others = pending.filter((t) => t.id !== transactionId);
      if (others.length > 0) {
        await tx
          .update(paymentTransactions)
          .set({ status: "VOIDED", updatedAt: now })
          .where(inArray(paymentTransactions.id, others.map((t) => t.id)));
        for (const t of others) if (t.providerReference && t.provider === deps.provider.name) retired.push(t.providerReference);
      }

      let qr;
      try {
        qr = await deps.provider.createQris({ transactionId, amount: plan.amount, expiresAt: plan.expiresAt });
      } catch (error) {
        logger.warn("payment_provider_create_qris_failed", { provider: deps.provider.name, error });
        throw new ProviderFailure();
      }
      const values = {
        provider: deps.provider.name,
        providerReference: qr.providerReference,
        qrString: qr.qrString,
        expiresAt: qr.expiresAt,
        updatedAt: now,
      };
      let row;
      if (attachable) {
        [row] = await tx.update(paymentTransactions).set(values).where(eq(paymentTransactions.id, transactionId)).returning();
      } else {
        [row] = await tx
          .insert(paymentTransactions)
          .values({ id: transactionId, orderId, purpose: plan.purpose, method: "QRIS", amount: plan.amount, status: "WAITING_PAYMENT", createdAt: now, ...values })
          .returning();
      }
      await syncOrderPayment(tx, orderId, now);
      await writeAudit(tx, {
        entityType: "payment_transaction",
        entityId: transactionId,
        eventType: "QRIS_CREATED",
        newValue: { orderId, purpose: plan.purpose, amount: plan.amount, expiresAt: qr.expiresAt.toISOString() },
        actor: { type: "CUSTOMER" },
      });
      return { ok: true, qris: toActive(row!) } as const;
    });
    if (result.ok) await cancelAtProvider(deps.provider, retired);
    return result;
  } catch (error) {
    // EC-13: provider down → nothing is marked paid; the customer may retry.
    if (error instanceof ProviderFailure) return { ok: false, error: "PROVIDER_UNAVAILABLE" };
    throw error;
  }
}

/** Remaining payment by bank transfer (FD-46, TD-09). Initial transfer transactions are created at checkout. */
export async function startTransferRemainingPayment(deps: Omit<PaymentDeps, "provider">, orderId: string) {
  const now = deps.clock.now();
  await expireRemainingPaymentsIfDue(deps.db, now, orderId);
  const settings = await getSettings(deps.db);
  return deps.db.transaction(async (tx) => {
    const order = await lockOrderRow(tx, orderId);
    if (!order) return { ok: false, error: "NOT_FOUND" } as const;
    const plan = planPayment(order, settings, now, "BANK_TRANSFER");
    if (!plan.ok) return plan;
    if (plan.purpose !== "REMAINING") return { ok: false, error: "METHOD_NOT_AVAILABLE" } as const;

    const txs = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.orderId, orderId)).for("update");
    if (txs.some((t) => t.status === "WAITING_VERIFICATION" && !t.isException)) return { ok: false, error: "PROOF_UNDER_REVIEW" } as const;
    const pending = txs.filter((t) => t.status === "WAITING_PAYMENT" && t.purpose === "REMAINING");
    const reusable = pending.find((t) => t.method === "BANK_TRANSFER" && t.amount === plan.amount && t.expiresAt && t.expiresAt.getTime() > now.getTime());
    if (reusable) return { ok: true, transactionId: reusable.id } as const;
    if (pending.length > 0) {
      await tx
        .update(paymentTransactions)
        .set({ status: "VOIDED", updatedAt: now })
        .where(inArray(paymentTransactions.id, pending.map((t) => t.id)));
    }
    const [row] = await tx
      .insert(paymentTransactions)
      .values({ orderId, purpose: "REMAINING", method: "BANK_TRANSFER", amount: plan.amount, status: "WAITING_PAYMENT", expiresAt: plan.expiresAt, createdAt: now, updatedAt: now })
      .returning({ id: paymentTransactions.id });
    await syncOrderPayment(tx, orderId, now);
    await writeAudit(tx, {
      entityType: "payment_transaction",
      entityId: row!.id,
      eventType: "TRANSFER_REMAINING_STARTED",
      newValue: { orderId, amount: plan.amount, expiresAt: plan.expiresAt.toISOString() },
      actor: { type: "CUSTOMER" },
    });
    return { ok: true, transactionId: row!.id } as const;
  });
}

type OrderRow = typeof orders.$inferSelect;

/** What the order may pay now, with which method (FD-39–FD-46, FD-109, TD-08, TD-09). */
function planPayment(
  order: OrderRow,
  settings: Settings,
  now: Date,
  method: "QRIS" | "BANK_TRANSFER",
): { ok: true; purpose: "DP" | "FULL" | "REMAINING"; amount: number; expiresAt: Date } | { ok: false; error: PaymentActionError } {
  if (order.orderStatus === "CANCELLED" || order.orderStatus === "COMPLETED") return { ok: false, error: "ORDER_CLOSED" };
  if (order.paidAmount >= order.grandTotal) return { ok: false, error: "ALREADY_PAID" };

  if (order.paidAmount === 0) {
    // Initial payment uses the method chosen at checkout; Cash is paid at pickup (FD-39).
    if (order.paymentMethod !== method) return { ok: false, error: "METHOD_NOT_AVAILABLE" };
    if (order.orderStatus !== "NEW" || !order.reservationExpiresAt) return { ok: false, error: "METHOD_NOT_AVAILABLE" };
    const expiresAt = method === "QRIS" ? initialQrExpiry(order.reservationExpiresAt, settings.qr_expiry_buffer_minutes) : order.reservationExpiresAt;
    if (expiresAt.getTime() <= now.getTime()) return { ok: false, error: "RESERVATION_EXPIRED" };
    return { ok: true, purpose: order.paymentOption === "DP_50" ? "DP" : "FULL", amount: order.dpAmount ?? order.grandTotal, expiresAt };
  }

  // Remaining payment: QRIS or transfer only, never Cash (FD-109). Own duration (TD-09).
  const minutes = method === "QRIS" ? settings.qris_remaining_payment_minutes : settings.transfer_remaining_payment_minutes;
  return { ok: true, purpose: "REMAINING", amount: order.grandTotal - order.paidAmount, expiresAt: new Date(now.getTime() + minutes * 60_000) };
}

function toActive(row: typeof paymentTransactions.$inferSelect): ActiveQris {
  return {
    transactionId: row.id,
    amount: row.amount,
    qrString: row.qrString ?? "",
    expiresAt: row.expiresAt!.toISOString(),
    purpose: row.purpose,
  };
}

async function cancelAtProvider(provider: PaymentProvider, references: string[]) {
  // Best effort (TD-20): a QR paid anyway is still handled by the webhook path.
  for (const ref of references) await provider.cancelQris?.(ref).catch(() => undefined);
}

export interface ProofUploadDeps {
  db: Database;
  clock: Clock;
  privateBucket: Pick<PrivateBucket, "put" | "delete">;
}

/**
 * Bank-transfer proof upload (§17, FD-50, FD-51). The type comes from magic bytes;
 * the file is stored privately under a server-generated key. The pending transfer
 * transaction becomes WAITING_VERIFICATION, which pauses the reservation timer (FD-120).
 */
export async function uploadPaymentProof(
  deps: ProofUploadDeps,
  args: { orderId: string; bytes: Uint8Array; actor: Extract<AuditActor, { type: "ADMIN" }> | { type: "CUSTOMER" } },
): Promise<{ ok: true; proofId: string } | { ok: false; error: PaymentActionError }> {
  const now = deps.clock.now();
  const file = validateProofFile(args.bytes);
  if (!file.ok) return { ok: false, error: file.error };
  if (args.actor.type === "CUSTOMER") {
    const limit = await consumeRateLimit(deps.db, `proof:order:${args.orderId}`, PAYMENT_RATE_LIMITS.proofPerOrder, now);
    if (!limit.allowed) return { ok: false, error: "RATE_LIMITED" };
  }

  await expireIfDue(deps.db, args.orderId, deps.clock);
  await expireRemainingPaymentsIfDue(deps.db, now, args.orderId);

  const proofId = randomUUID();
  const key = `proofs/${args.orderId}/${proofId}.${PROOF_EXTENSION[file.mime]}`;
  const sha256 = createHash("sha256").update(args.bytes).digest("hex");
  await deps.privateBucket.put(key, args.bytes, file.mime);

  try {
    const result = await deps.db.transaction(async (tx) => {
      const order = await lockOrderRow(tx, args.orderId);
      if (!order) return { ok: false, error: "NOT_FOUND" } as const;
      if (order.orderStatus === "CANCELLED") return { ok: false, error: order.cancellationReason === "PAYMENT_EXPIRED" ? "PAYMENT_EXPIRED" : "ORDER_CLOSED" } as const;
      if (order.orderStatus === "COMPLETED" || order.paidAmount >= order.grandTotal) return { ok: false, error: "ALREADY_PAID" } as const;

      const [target] = await tx
        .select()
        .from(paymentTransactions)
        .where(
          and(
            eq(paymentTransactions.orderId, args.orderId),
            eq(paymentTransactions.method, "BANK_TRANSFER"),
            inArray(paymentTransactions.status, ["WAITING_PAYMENT", "WAITING_VERIFICATION"]),
            eq(paymentTransactions.isException, false),
          ),
        )
        .orderBy(desc(paymentTransactions.createdAt))
        .limit(1)
        .for("update");
      if (!target) return { ok: false, error: "NO_PENDING_TRANSFER" } as const;
      if (target.status === "WAITING_VERIFICATION") return { ok: false, error: "PROOF_UNDER_REVIEW" } as const;
      if (target.expiresAt && target.expiresAt.getTime() <= now.getTime()) return { ok: false, error: "PAYMENT_EXPIRED" } as const;

      await tx.insert(paymentProofs).values({
        id: proofId,
        paymentTransactionId: target.id,
        orderId: args.orderId,
        storageKey: key,
        mimeType: file.mime,
        sizeBytes: args.bytes.byteLength,
        sha256,
        uploadedAt: now,
      });
      await tx.update(paymentTransactions).set({ status: "WAITING_VERIFICATION", updatedAt: now }).where(eq(paymentTransactions.id, target.id));
      await syncOrderPayment(tx, args.orderId, now);
      await writeAudit(tx, {
        entityType: "payment_transaction",
        entityId: target.id,
        eventType: "PAYMENT_PROOF_UPLOADED",
        newValue: { orderId: args.orderId, proofId, mimeType: file.mime, sizeBytes: args.bytes.byteLength },
        actor: args.actor,
      });
      return { ok: true, proofId } as const;
    });
    if (!result.ok) await deps.privateBucket.delete(key).catch(() => undefined);
    return result;
  } catch (error) {
    await deps.privateBucket.delete(key).catch(() => undefined);
    throw error;
  }
}


/** Tracking-page payment panel. Call after lazy expiry (getTrackingView does it). */
export async function getCustomerPaymentState(db: Database, orderId: string, clock: Clock): Promise<CustomerPaymentState | null> {
  const now = clock.now();
  await expireRemainingPaymentsIfDue(db, now, orderId);
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return null;
  const settings = await getSettings(db);
  const txs = await db
    .select()
    .from(paymentTransactions)
    .where(and(eq(paymentTransactions.orderId, orderId), eq(paymentTransactions.isException, false)))
    .orderBy(desc(paymentTransactions.createdAt));
  const [lastProof] = await db
    .select({ status: paymentProofs.verificationStatus })
    .from(paymentProofs)
    .where(eq(paymentProofs.orderId, orderId))
    .orderBy(desc(paymentProofs.uploadedAt))
    .limit(1);

  const valid = (t: (typeof txs)[number]) => !t.expiresAt || t.expiresAt.getTime() > now.getTime();
  const qris = txs.find((t) => t.method === "QRIS" && t.status === "WAITING_PAYMENT" && t.qrString && valid(t));
  const transfer = txs.find((t) => t.method === "BANK_TRANSFER" && t.status === "WAITING_PAYMENT" && valid(t));
  const latest = txs.find((t) => t.method !== "CASH");
  const closed = order.orderStatus === "CANCELLED" || order.orderStatus === "COMPLETED";

  let stage: CustomerPaymentState["stage"];
  if (closed) stage = "CLOSED";
  else if (order.paidAmount >= order.grandTotal) stage = "PAID";
  else if (txs.some((t) => t.status === "WAITING_VERIFICATION")) stage = "VERIFYING";
  else if (order.paymentMethod === "CASH") stage = "CASH_AT_PICKUP";
  else if (order.paidAmount > 0) stage = "PAY_REMAINING";
  else stage = "PAY_INITIAL";

  const amountDue = order.paidAmount > 0 ? order.grandTotal - order.paidAmount : (order.dpAmount ?? order.grandTotal);
  const deadline =
    stage === "PAY_INITIAL"
      ? (order.reservationExpiresAt?.toISOString() ?? null)
      : stage === "PAY_REMAINING"
        ? ((qris ?? transfer)?.expiresAt?.toISOString() ?? null)
        : null;
  return {
    method: order.paymentMethod,
    stage,
    amountDue: Math.max(amountDue, 0),
    deadline,
    activeQris: qris ? toActive(qris) : null,
    pendingTransfer: transfer ? { transactionId: transfer.id, amount: transfer.amount, expiresAt: transfer.expiresAt?.toISOString() ?? null, purpose: transfer.purpose } : null,
    lastAttempt: latest && (latest.status === "FAILED" || latest.status === "EXPIRED") ? latest.status : null,
    lastProofRejected: lastProof?.status === "REJECTED" && !txs.some((t) => t.status === "WAITING_VERIFICATION"),
    bankAccounts: settings.bank_accounts,
    paymentInstructions: settings.payment_instructions,
  };
}

/** Provider reference of the order's live QR (development simulator only). */
export async function activeQrisReference(db: Database, orderId: string, clock: Clock): Promise<string | null> {
  const now = clock.now();
  const rows = await db
    .select({ ref: paymentTransactions.providerReference, expiresAt: paymentTransactions.expiresAt })
    .from(paymentTransactions)
    .where(and(eq(paymentTransactions.orderId, orderId), eq(paymentTransactions.method, "QRIS"), eq(paymentTransactions.status, "WAITING_PAYMENT")))
    .orderBy(desc(paymentTransactions.createdAt));
  return rows.find((r) => r.ref && (!r.expiresAt || r.expiresAt > now))?.ref ?? null;
}
