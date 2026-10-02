import { describe, expect, it } from "vitest";

import {
  allowedTransitions,
  checkTransition,
  ORDER_STATUSES,
  type OrderPaymentStatus,
  type OrderStatus,
  type PaymentMethod,
  type TransitionActor,
} from "@/server/domain/orders/state-machine";

const ACTORS: TransitionActor[] = ["ADMIN", "SYSTEM"];
const METHODS: PaymentMethod[] = ["QRIS", "BANK_TRANSFER", "CASH"];
const PAYMENT_STATUSES: OrderPaymentStatus[] = [
  "UNPAID",
  "WAITING_PAYMENT",
  "WAITING_VERIFICATION",
  "PARTIALLY_PAID",
  "PAID",
  "FAILED",
  "EXPIRED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
];

/**
 * Independent oracle written from IMPLEMENTATION-PLAN §19 / FD-54 / FD-116 / DI-09,
 * so the table in state-machine.ts is checked against the spec, not against itself.
 */
function oracle(
  from: OrderStatus,
  to: OrderStatus,
  actor: TransitionActor,
  method: PaymentMethod,
  pay: OrderPaymentStatus,
  reason: boolean,
  expiry: boolean,
): boolean {
  const paidSome = pay === "PARTIALLY_PAID" || pay === "PAID";
  if (from === "COMPLETED" || from === "CANCELLED") return false; // terminal, no reinstate
  if (actor === "SYSTEM") {
    if (from === "NEW" && to === "CONFIRMED") return method === "QRIS" && paidSome; // webhook only
    if (from === "NEW" && to === "CANCELLED") return method !== "CASH" && expiry; // payment expiry only
    return false;
  }
  if (to === "CANCELLED") return reason; // admin may cancel any non-terminal order with a reason
  if (from === "NEW" && to === "CONFIRMED") return method === "CASH" || (method === "BANK_TRANSFER" && paidSome);
  if (from === "CONFIRMED" && to === "PROCESSING") return true;
  if (from === "PROCESSING" && to === "READY_FOR_PICKUP") return true;
  if (from === "READY_FOR_PICKUP" && to === "COMPLETED") return pay === "PAID";
  return false;
}

describe("order state machine — exhaustive (TD-14)", () => {
  it("matches the spec for every (from, to, actor, method, payment status, reason, expiry)", () => {
    let checked = 0;
    for (const from of ORDER_STATUSES)
      for (const to of ORDER_STATUSES)
        for (const actor of ACTORS)
          for (const method of METHODS)
            for (const pay of PAYMENT_STATUSES)
              for (const reason of [true, false])
                for (const expiry of [true, false]) {
                  const result = checkTransition(from, to, actor, {
                    paymentMethod: method,
                    paymentStatus: pay,
                    reason: reason ? "Alasan" : "  ",
                    systemReason: expiry ? "PAYMENT_EXPIRED" : undefined,
                  });
                  const expected = oracle(from, to, actor, method, pay, reason, expiry);
                  expect({
                    from,
                    to,
                    actor,
                    method,
                    pay,
                    reason,
                    expiry,
                    allowed: result === null,
                  }).toEqual({
                    from,
                    to,
                    actor,
                    method,
                    pay,
                    reason,
                    expiry,
                    allowed: expected,
                  });
                  checked++;
                }
    expect(checked).toBe(6 * 6 * 2 * 3 * 9 * 2 * 2);
  });

  it("returns specific error codes the UI can explain", () => {
    const ctx = {
      paymentMethod: "CASH" as const,
      paymentStatus: "UNPAID" as const,
    };
    expect(checkTransition("READY_FOR_PICKUP", "COMPLETED", "ADMIN", ctx)).toBe("PAYMENT_NOT_COMPLETE");
    expect(checkTransition("NEW", "CANCELLED", "ADMIN", ctx)).toBe("REASON_REQUIRED");
    expect(
      checkTransition("NEW", "CANCELLED", "SYSTEM", {
        ...ctx,
        systemReason: "PAYMENT_EXPIRED",
      }),
    ).toBe("CASH_DOES_NOT_EXPIRE");
    expect(
      checkTransition("NEW", "CONFIRMED", "ADMIN", {
        paymentMethod: "QRIS",
        paymentStatus: "PAID",
      }),
    ).toBe("PAYMENT_NOT_CONFIRMED");
    expect(checkTransition("NEW", "PROCESSING", "ADMIN", ctx)).toBe("INVALID_TRANSITION");
    expect(checkTransition("CANCELLED", "NEW", "ADMIN", ctx)).toBe("INVALID_TRANSITION");
  });

  it("allowedTransitions lists only what the admin can do now", () => {
    expect(
      allowedTransitions("NEW", "ADMIN", {
        paymentMethod: "CASH",
        paymentStatus: "UNPAID",
      }),
    ).toEqual(["CONFIRMED", "CANCELLED"]);
    expect(
      allowedTransitions("NEW", "ADMIN", {
        paymentMethod: "QRIS",
        paymentStatus: "WAITING_PAYMENT",
      }),
    ).toEqual(["CANCELLED"]);
    expect(
      allowedTransitions("READY_FOR_PICKUP", "ADMIN", {
        paymentMethod: "BANK_TRANSFER",
        paymentStatus: "PAID",
      }),
    ).toEqual(["COMPLETED", "CANCELLED"]);
    expect(
      allowedTransitions("COMPLETED", "ADMIN", {
        paymentMethod: "CASH",
        paymentStatus: "PAID",
      }),
    ).toEqual([]);
  });
});
