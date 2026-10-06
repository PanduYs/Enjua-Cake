import "server-only";

import { and, eq, inArray, isNotNull } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { orders, paymentTransactions } from "@/server/db/schema";
import { isPaymentProviderError, type PaymentProvider } from "@/server/payments/types";

/**
 * Payment reconciliation report (plan §38 runbook): compares QRIS transactions that
 * the database does not consider paid with the provider's status API (the source of
 * truth). Read-only — it changes nothing. A mismatch means a webhook was missed; the
 * fix is to have the provider resend the notification (or resend it from the
 * provider dashboard), which goes through the normal verified webhook path.
 */
export interface ReconcileRow {
  transactionId: string;
  orderNumber: string;
  amount: number;
  dbStatus: string;
  providerStatus: string;
  mismatch: boolean;
}

export async function reconcilePayments(db: Database, provider: PaymentProvider, options: { since?: Date } = {}): Promise<ReconcileRow[]> {
  const rows = await db
    .select({
      id: paymentTransactions.id,
      ref: paymentTransactions.providerReference,
      amount: paymentTransactions.amount,
      status: paymentTransactions.status,
      createdAt: paymentTransactions.createdAt,
      orderNumber: orders.orderNumber,
    })
    .from(paymentTransactions)
    .innerJoin(orders, eq(paymentTransactions.orderId, orders.id))
    .where(
      and(
        eq(paymentTransactions.method, "QRIS"),
        eq(paymentTransactions.provider, provider.name),
        isNotNull(paymentTransactions.providerReference),
        inArray(paymentTransactions.status, ["WAITING_PAYMENT", "FAILED", "EXPIRED", "VOIDED"]),
      ),
    );
  const out: ReconcileRow[] = [];
  for (const r of rows) {
    if (options.since && r.createdAt < options.since) continue;
    let providerStatus: string;
    try {
      providerStatus = (await provider.getTransactionStatus(r.ref!))?.status ?? "UNKNOWN";
    } catch (error) {
      providerStatus = isPaymentProviderError(error) ? "PROVIDER_UNAVAILABLE" : "ERROR";
    }
    out.push({ transactionId: r.id, orderNumber: r.orderNumber, amount: r.amount, dbStatus: r.status, providerStatus, mismatch: providerStatus === "PAID" });
  }
  return out;
}

/** Rows whose provider status could not be read are not "ok": the report is incomplete. */
export const isUnchecked = (row: ReconcileRow) => row.providerStatus === "PROVIDER_UNAVAILABLE" || row.providerStatus === "ERROR";

export interface ReconcileSummary {
  checked: number;
  mismatches: number;
  unchecked: number;
  /** 0 = every transaction checked and none missed; 1 = a mismatch or an unchecked transaction. */
  exitCode: 0 | 1;
}

export function summarizeReconcile(rows: ReconcileRow[]): ReconcileSummary {
  const mismatches = rows.filter((r) => r.mismatch).length;
  const unchecked = rows.filter(isUnchecked).length;
  return { checked: rows.length - unchecked, mismatches, unchecked, exitCode: mismatches || unchecked ? 1 : 0 };
}
