/**
 * Order status state machine (FD-54, FD-116, FD-118, IMPLEMENTATION-PLAN §19, TD-14).
 * The table is the single source of allowed transitions; nothing else may change
 * order_status. Selesai and Dibatalkan are terminal (no reinstate).
 */
export type OrderStatus = "NEW" | "CONFIRMED" | "PROCESSING" | "READY_FOR_PICKUP" | "COMPLETED" | "CANCELLED";
export type TransitionActor = "ADMIN" | "SYSTEM";
export type PaymentMethod = "QRIS" | "BANK_TRANSFER" | "CASH";
export type OrderPaymentStatus =
  | "UNPAID"
  | "WAITING_PAYMENT"
  | "WAITING_VERIFICATION"
  | "PARTIALLY_PAID"
  | "PAID"
  | "FAILED"
  | "EXPIRED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export const ORDER_STATUSES: readonly OrderStatus[] = ["NEW", "CONFIRMED", "PROCESSING", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"];
export const TERMINAL_STATUSES: readonly OrderStatus[] = ["COMPLETED", "CANCELLED"];

export interface TransitionContext {
  paymentMethod: PaymentMethod;
  paymentStatus: OrderPaymentStatus;
  /** Required for cancellations by an admin (FD-60). */
  reason?: string | null;
  /** SYSTEM cancellation must be a payment expiry (FD-56). */
  systemReason?: "PAYMENT_EXPIRED";
}

export type TransitionError = "INVALID_TRANSITION" | "REASON_REQUIRED" | "PAYMENT_NOT_COMPLETE" | "PAYMENT_NOT_CONFIRMED" | "CASH_DOES_NOT_EXPIRE";

interface Rule {
  from: OrderStatus;
  to: OrderStatus;
  actor: TransitionActor;
  guard: (ctx: TransitionContext) => TransitionError | null;
}

const confirmedPayment = (ctx: TransitionContext) => ctx.paymentStatus === "PARTIALLY_PAID" || ctx.paymentStatus === "PAID";
const needsReason = (ctx: TransitionContext): TransitionError | null => (ctx.reason && ctx.reason.trim().length > 0 ? null : "REASON_REQUIRED");

export const TRANSITIONS: readonly Rule[] = [
  // QRIS: confirmed only by a verified webhook (FD-111, DI-04).
  {
    from: "NEW",
    to: "CONFIRMED",
    actor: "SYSTEM",
    guard: (ctx) => (ctx.paymentMethod === "QRIS" && confirmedPayment(ctx) ? null : "PAYMENT_NOT_CONFIRMED"),
  },
  // Transfer: admin approves the proof (payment confirmed). Cash: admin accepts the order.
  {
    from: "NEW",
    to: "CONFIRMED",
    actor: "ADMIN",
    guard: (ctx) => {
      if (ctx.paymentMethod === "CASH") return null;
      if (ctx.paymentMethod === "BANK_TRANSFER" && confirmedPayment(ctx)) return null;
      return "PAYMENT_NOT_CONFIRMED";
    },
  },
  {
    from: "NEW",
    to: "CANCELLED",
    actor: "SYSTEM",
    guard: (ctx) => (ctx.paymentMethod === "CASH" ? "CASH_DOES_NOT_EXPIRE" : ctx.systemReason === "PAYMENT_EXPIRED" ? null : "INVALID_TRANSITION"),
  },
  { from: "NEW", to: "CANCELLED", actor: "ADMIN", guard: needsReason },
  { from: "CONFIRMED", to: "PROCESSING", actor: "ADMIN", guard: () => null },
  { from: "CONFIRMED", to: "CANCELLED", actor: "ADMIN", guard: needsReason },
  {
    from: "PROCESSING",
    to: "READY_FOR_PICKUP",
    actor: "ADMIN",
    guard: () => null,
  },
  { from: "PROCESSING", to: "CANCELLED", actor: "ADMIN", guard: needsReason },
  // Selesai requires full payment for every method (DI-09, FD-109).
  {
    from: "READY_FOR_PICKUP",
    to: "COMPLETED",
    actor: "ADMIN",
    guard: (ctx) => (ctx.paymentStatus === "PAID" ? null : "PAYMENT_NOT_COMPLETE"),
  },
  {
    from: "READY_FOR_PICKUP",
    to: "CANCELLED",
    actor: "ADMIN",
    guard: needsReason,
  },
];

export function checkTransition(from: OrderStatus, to: OrderStatus, actor: TransitionActor, ctx: TransitionContext): TransitionError | null {
  const rules = TRANSITIONS.filter((r) => r.from === from && r.to === to && r.actor === actor);
  if (rules.length === 0) return "INVALID_TRANSITION";
  // Any matching rule may allow it; report the first rule's error otherwise.
  const errors = rules.map((r) => r.guard(ctx));
  return errors.includes(null) ? null : errors[0]!;
}

/** Targets an actor may move to from the current status, ignoring guards (for UI listing). */
export function candidateTransitions(from: OrderStatus, actor: TransitionActor): OrderStatus[] {
  return [...new Set(TRANSITIONS.filter((r) => r.from === from && r.actor === actor).map((r) => r.to))];
}

/** Targets that currently pass their guards (reason assumed to be provided for cancellations). */
export function allowedTransitions(from: OrderStatus, actor: TransitionActor, ctx: Omit<TransitionContext, "reason">): OrderStatus[] {
  return candidateTransitions(from, actor).filter((to) => checkTransition(from, to, actor, { ...ctx, reason: "x" }) === null);
}
