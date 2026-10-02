/**
 * Payment method/option rules (FD-36..44, BR-12, BR-13, BR-18).
 */
export type PaymentMethod = "QRIS" | "BANK_TRANSFER" | "CASH";
export type PaymentOption = "DP_50" | "FULL";

export const PAYMENT_METHODS: readonly PaymentMethod[] = ["QRIS", "BANK_TRANSFER", "CASH"];

/** Cash only for Ready Stock-only orders (FD-40, FD-41). */
export function isMethodAllowed(method: PaymentMethod, hasPreorder: boolean): boolean {
  return method !== "CASH" || !hasPreorder;
}

/** DP only for QRIS and Bank Transfer; Cash is always full (FD-39, FD-42). */
export function allowedOptions(method: PaymentMethod): PaymentOption[] {
  return method === "CASH" ? ["FULL"] : ["DP_50", "FULL"];
}

/** DP = ceil(total × 0.5) in integer Rupiah (FD-44). */
export function dpAmount(total: number): number {
  if (!Number.isInteger(total) || total < 0) throw new RangeError("total must be a non-negative integer");
  return Math.ceil(total / 2);
}

export interface PaymentBreakdown {
  total: number;
  dpAmount: number | null;
  /** What the customer pays first (DP or full; for Cash, at pickup). */
  dueNow: number;
  /** Remaining after the first payment. */
  remaining: number;
}

export function paymentBreakdown(total: number, option: PaymentOption): PaymentBreakdown {
  if (option === "DP_50") {
    const dp = dpAmount(total);
    return { total, dpAmount: dp, dueNow: dp, remaining: total - dp };
  }
  return { total, dpAmount: null, dueNow: total, remaining: 0 };
}

export type PaymentSelectionError = "CASH_NOT_ALLOWED_FOR_PREORDER" | "OPTION_NOT_ALLOWED_FOR_METHOD";

export function validatePaymentSelection(method: PaymentMethod, option: PaymentOption, hasPreorder: boolean): PaymentSelectionError | null {
  if (!isMethodAllowed(method, hasPreorder)) return "CASH_NOT_ALLOWED_FOR_PREORDER";
  if (!allowedOptions(method).includes(option)) return "OPTION_NOT_ALLOWED_FOR_METHOD";
  return null;
}
