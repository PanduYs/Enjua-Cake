import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import { createFixedClock } from "@/server/clock";
import { createDatabase, type DatabaseHandle } from "@/server/db/client";
import { admins, categories, orders, paymentExceptions, paymentTransactions, products } from "@/server/db/schema";
import { MockPaymentProvider } from "@/server/payments/mock-provider";
import { transitionOrder } from "@/server/services/order-lifecycle";
import { approvePaymentProof, recordRefund, resolvePaymentException } from "@/server/services/payment-admin";
import { processPaymentWebhook } from "@/server/services/payment-webhook";
import { requestQrisPayment, uploadPaymentProof } from "@/server/services/payments";
import { placeOrder } from "@/server/services/place-order";

let handle: DatabaseHandle;
const START = new Date("2026-10-02T03:00:00Z");
const clock = createFixedClock(START);
const ADMIN = "admin-hardening";
let provider: MockPaymentProvider;
let productId: string;
const deps = () => ({ db: handle.db, clock, provider });
const admin = { type: "ADMIN" as const, adminId: ADMIN };
const bucket = { put: async (key: string, b: Uint8Array) => ({ key, contentType: "", size: b.byteLength }), delete: async () => undefined };
const PDF = new TextEncoder().encode("%PDF-1.4 bukti");

beforeAll(() => {
  handle = createDatabase(inject("databaseUrl"), { max: 20, silenceNotices: true });
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  clock.set(START);
  provider = new MockPaymentProvider({ webhookSecret: "hardening-webhook-secret", now: () => clock.now() });
  await handle.db.execute(sql`TRUNCATE orders, pickup_dates, product_images, products, categories, settings, rate_limits, audit_logs, payment_webhook_events, admins RESTART IDENTITY CASCADE`);
  await handle.db.insert(admins).values({ id: ADMIN, name: "Admin H", email: "h@example.test" });
  const [cat] = await handle.db.insert(categories).values({ name: "C", slug: "c" }).returning({ id: categories.id });
  productId = (await handle.db.insert(products).values({ categoryId: cat!.id, name: "Kue", slug: "kue", price: 100_000, productType: "READY_STOCK" }).returning({ id: products.id }))[0]!.id;
});

async function order(paymentMethod: "QRIS" | "BANK_TRANSFER", paymentOption: "DP_50" | "FULL" = "FULL") {
  const r = await placeOrder(
    { db: handle.db, clock, publicBucket: { publicUrl: (k) => k } },
    { items: [{ productId, quantity: 1 }], customerName: "S", whatsapp: "081234567890", notes: "", pickupDate: "2026-10-03", paymentMethod, paymentOption },
    { idempotencyKey: randomUUID(), clientIp: randomUUID() },
  );
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.order.orderId;
}
const row = async (id: string) => (await handle.db.select().from(orders).where(eq(orders.id, id)))[0]!;
const txs = (id: string) => handle.db.select().from(paymentTransactions).where(eq(paymentTransactions.orderId, id));

/** paid_amount must always equal the counted (non-exception) successful payments (§14.1). */
async function expectConsistent(orderId: string) {
  const o = await row(orderId);
  const counted = (await txs(orderId)).filter((t) => t.status === "PAID" && !t.isException).reduce((s, t) => s + t.amount, 0);
  expect(o.paidAmount).toBe(counted);
  expect(o.remainingAmount).toBe(Math.max(o.grandTotal - counted, 0));
  return o;
}

describe("races between admin actions and payments (plan §31)", () => {
  it("admin cancel vs verified QRIS webhook: always a consistent, explainable end state", async () => {
    for (let i = 0; i < 6; i++) {
      const id = await order("QRIS");
      const q = await requestQrisPayment(deps(), id);
      if (!q.ok) throw new Error(q.error);
      const [t] = (await txs(id)).filter((x) => x.id === q.qris.transactionId);
      const [, cancel] = await Promise.all([
        processPaymentWebhook(deps(), provider.simulatePayment(t!.providerReference!, "PAID")),
        transitionOrder(handle.db, { orderId: id, to: "CANCELLED", actor: admin, reason: "Permintaan customer" }, clock),
      ]);
      const o = await expectConsistent(id);
      const exceptions = await handle.db.select().from(paymentExceptions).where(eq(paymentExceptions.orderId, id));
      // Either paid first (counted, then cancelled → refund to record) or cancelled first (late payment exception).
      if (o.paidAmount > 0) expect(exceptions).toHaveLength(0);
      else expect(exceptions.map((e) => e.kind)).toEqual(["LATE_PAYMENT_AFTER_CANCEL"]);
      expect(cancel.ok).toBe(true);
      expect(o.orderStatus).toBe("CANCELLED");
    }
  });

  it("proof approval vs admin cancel: approved money on a cancelled order becomes an exception, never counted", async () => {
    for (let i = 0; i < 6; i++) {
      const id = await order("BANK_TRANSFER");
      const up = await uploadPaymentProof({ db: handle.db, clock, privateBucket: bucket }, { orderId: id, bytes: PDF, actor: { type: "CUSTOMER" } });
      if (!up.ok) throw new Error(up.error);
      const [approve, cancel] = await Promise.all([
        approvePaymentProof(handle.db, { proofId: up.proofId, adminId: ADMIN }, clock),
        transitionOrder(handle.db, { orderId: id, to: "CANCELLED", actor: admin, reason: "Dibatalkan" }, clock),
      ]);
      const o = await expectConsistent(id);
      expect(approve.ok).toBe(true);
      if (cancel.ok) {
        expect(o.orderStatus).toBe("CANCELLED");
      } else {
        // Approval confirmed the order first; a cancel with stale expectations would have failed cleanly.
        expect(o.orderStatus).toBe("CONFIRMED");
      }
    }
  });
});

describe("refund records cannot exceed the money actually received (FD-62)", () => {
  it("keeps exception money and counted money apart", async () => {
    // Paid order, then a duplicate (old QR) payment → one counted + one exception transaction.
    const id = await order("QRIS");
    const first = await requestQrisPayment(deps(), id);
    if (!first.ok) throw new Error(first.error);
    const firstRef = (await txs(id)).find((t) => t.id === first.qris.transactionId)!.providerReference!;
    await processPaymentWebhook(deps(), provider.simulatePayment(firstRef, "FAILED"));
    const second = await requestQrisPayment(deps(), id);
    if (!second.ok) throw new Error(second.error);
    await processPaymentWebhook(deps(), provider.simulatePayment((await txs(id)).find((t) => t.id === second.qris.transactionId)!.providerReference!, "PAID"));
    expect((await processPaymentWebhook(deps(), provider.simulatePayment(firstRef, "PAID"))).outcome).toBe("EXCEPTION_DUPLICATE_PAYMENT");
    await transitionOrder(handle.db, { orderId: id, to: "CANCELLED", actor: admin, reason: "Batal" }, clock);

    // Order-level refund is limited to the counted 100.000, not the 200.000 received in total.
    expect(await recordRefund(handle.db, { orderId: id, adminId: ADMIN, amount: 150_000, reason: "x", status: "COMPLETED" }, clock)).toEqual({ ok: false, error: "EXCEEDS_REFUNDABLE" });
    expect((await recordRefund(handle.db, { orderId: id, adminId: ADMIN, amount: 100_000, reason: "Refund pesanan", status: "COMPLETED" }, clock)).ok).toBe(true);
    expect((await row(id)).paymentStatus).toBe("REFUNDED");

    // The exception's own 100.000 can still be refunded once via its resolution — and only once.
    const [exc] = await handle.db.select().from(paymentExceptions).where(eq(paymentExceptions.orderId, id));
    expect((await resolvePaymentException(handle.db, { exceptionId: exc!.id, adminId: ADMIN, resolution: "REFUNDED", note: "Kembalikan pembayaran ganda" }, clock)).ok).toBe(true);
    expect(await recordRefund(handle.db, { orderId: id, adminId: ADMIN, amount: 1, reason: "lagi", status: "COMPLETED", paymentTransactionId: exc!.paymentTransactionId }, clock)).toEqual({ ok: false, error: "EXCEEDS_REFUNDABLE" });
    expect(await recordRefund(handle.db, { orderId: id, adminId: ADMIN, amount: 1, reason: "lagi", status: "COMPLETED" }, clock)).toEqual({ ok: false, error: "EXCEEDS_REFUNDABLE" });
    await expectConsistent(id);
  });
});
