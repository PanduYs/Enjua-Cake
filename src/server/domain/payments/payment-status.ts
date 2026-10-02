import type { OrderPaymentStatus } from "../orders/state-machine";

export type TransactionStatus = "WAITING_PAYMENT" | "WAITING_VERIFICATION" | "PAID" | "FAILED" | "EXPIRED" | "VOIDED";

export interface PaymentFacts {
  grandTotal: number;
  paymentMethod: "QRIS" | "BANK_TRANSFER" | "CASH";
  /** Order was cancelled because its reservation ran out (FD-56). */
  orderExpired: boolean;
  transactions: ReadonlyArray<{ status: TransactionStatus; amount: number; isException: boolean; expiresAt: Date | null; createdAt: Date }>;
  /** Completed refunds of counted (non-exception) payments. */
  refundedAmount: number;
}

/** paid_amount = successful, non-exception transactions only (FD-112, §14.1). */
export function paidAmountOf(facts: Pick<PaymentFacts, "transactions">): number {
  return facts.transactions.filter((t) => t.status === "PAID" && !t.isException).reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Order payment status derived from its transactions and refunds, in the
 * evaluation order of IMPLEMENTATION-PLAN §20.2 (FD-52).
 */
export function derivePaymentStatus(facts: PaymentFacts, now: Date): OrderPaymentStatus {
  const paid = paidAmountOf(facts);
  if (facts.refundedAmount > 0 && paid > 0) return facts.refundedAmount >= paid ? "REFUNDED" : "PARTIALLY_REFUNDED";
  if (paid >= facts.grandTotal && facts.grandTotal > 0) return "PAID";
  if (paid > 0) return "PARTIALLY_PAID";

  const live = facts.transactions.filter((t) => !t.isException);
  if (live.some((t) => t.status === "WAITING_VERIFICATION")) return "WAITING_VERIFICATION";
  if (live.some((t) => t.status === "WAITING_PAYMENT" && (t.expiresAt === null || t.expiresAt.getTime() > now.getTime()))) return "WAITING_PAYMENT";
  if (facts.orderExpired) return "EXPIRED";

  const latest = [...live].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (latest?.status === "FAILED") return "FAILED";
  if (facts.paymentMethod === "CASH") return "UNPAID";
  // Initial transaction exists but is no longer payable and the order has not been finalized yet.
  return latest ? "WAITING_PAYMENT" : "UNPAID";
}

/**
 * QR validity for initial payments ends before the slot is released (TD-08):
 * min(requested, reservation − buffer). Remaining payments use their own expiry.
 */
export function initialQrExpiry(reservationExpiresAt: Date, bufferMinutes: number): Date {
  return new Date(reservationExpiresAt.getTime() - bufferMinutes * 60_000);
}
