import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Internal technical identifiers (FINAL-REQUIREMENT-DECISIONS §0.2).
 * UI labels are Bahasa Indonesia and live in the presentation layer.
 */
export const productTypeEnum = pgEnum("product_type", ["READY_STOCK", "PRE_ORDER"]);
export const productAvailabilityEnum = pgEnum("product_availability", ["AVAILABLE", "SOLD_OUT"]);

export const orderSourceEnum = pgEnum("order_source", ["WEBSITE", "MANUAL"]);

/** Pesanan Baru, Dikonfirmasi, Pesanan Diproses, Siap Diambil, Selesai, Dibatalkan (FD-54). */
export const orderStatusEnum = pgEnum("order_status", [
  "NEW",
  "CONFIRMED",
  "PROCESSING",
  "READY_FOR_PICKUP",
  "COMPLETED",
  "CANCELLED",
]);

/** Order-level payment status (FD-52). */
export const paymentStatusEnum = pgEnum("payment_status", [
  "UNPAID",
  "WAITING_PAYMENT",
  "WAITING_VERIFICATION",
  "PARTIALLY_PAID",
  "PAID",
  "FAILED",
  "EXPIRED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]);

export const paymentMethodEnum = pgEnum("payment_method", ["QRIS", "BANK_TRANSFER", "CASH"]);
export const paymentOptionEnum = pgEnum("payment_option", ["DP_50", "FULL"]);
export const paymentPurposeEnum = pgEnum("payment_purpose", ["DP", "FULL", "REMAINING"]);

/** Transaction-level status (IMPLEMENTATION-PLAN §20.1). VOIDED = superseded pending QRIS (TD-20). */
export const paymentTransactionStatusEnum = pgEnum("payment_transaction_status", [
  "WAITING_PAYMENT",
  "WAITING_VERIFICATION",
  "PAID",
  "FAILED",
  "EXPIRED",
  "VOIDED",
]);

export const proofVerificationStatusEnum = pgEnum("proof_verification_status", ["PENDING", "APPROVED", "REJECTED"]);

export const paymentExceptionKindEnum = pgEnum("payment_exception_kind", [
  "LATE_PAYMENT_AFTER_CANCEL",
  "AMOUNT_MISMATCH",
  "DUPLICATE_PAYMENT",
]);
export const paymentExceptionStatusEnum = pgEnum("payment_exception_status", ["OPEN", "RESOLVED"]);
export const paymentExceptionResolutionEnum = pgEnum("payment_exception_resolution", ["REFUNDED", "RESOLVED_MANUALLY"]);

/** Manual Order overrides allowed by FD-119 — nothing else. */
export const orderOverrideTypeEnum = pgEnum("order_override_type", [
  "MIN_PREORDER_DAYS",
  "BOOKING_HORIZON",
  "PICKUP_CUTOFF",
  "DAILY_CAPACITY",
]);

export const actorTypeEnum = pgEnum("actor_type", ["ADMIN", "SYSTEM", "CUSTOMER"]);
