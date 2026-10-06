import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import { createFixedClock } from "@/server/clock";
import { createDatabase, type DatabaseHandle } from "@/server/db/client";
import { auditLogs, categories, orders, paymentExceptions, paymentTransactions, paymentWebhookEvents, products } from "@/server/db/schema";
import { midtransSignature, MidtransPaymentProvider } from "@/server/payments/midtrans-provider";
import { processPaymentWebhook } from "@/server/services/payment-webhook";
import { requestQrisPayment } from "@/server/services/payments";
import { placeOrder } from "@/server/services/place-order";

/**
 * The real Midtrans adapter behind the webhook service (TD-08, §16): notification signature,
 * the status re-check, and how each Midtrans reply ends up in the database. Only the network
 * is stubbed; replies follow the Midtrans Core API shapes seen on the sandbox.
 */

// Test-only fake key; Midtrans is never called.
const KEY = "SB-Mid-server-TEST-ONLY-not-a-real-key";
const MIDTRANS_TX = "beac309c-0000-4000-8000-000000000001";
const START = new Date("2026-10-02T03:00:00Z"); // 10:00 WIB
const clock = createFixedClock(START);

let handle: DatabaseHandle;
let productId: string;
let provider: MidtransPaymentProvider;
let statusReply: { status: number; body: Record<string, string> };
let calls: string[];

function stubFetch(url: string, init?: RequestInit): Response {
  calls.push(`${init?.method ?? "GET"} ${url}`);
  if (url.endsWith("/v2/charge")) {
    const order = JSON.parse(String(init?.body)).transaction_details.order_id as string;
    return Response.json({ status_code: "201", status_message: "Success, QRIS transaction is created", order_id: order, qr_string: `00020101021226-${order}` }, { status: 200 });
  }
  return Response.json(statusReply.body, { status: statusReply.status });
}

beforeAll(() => {
  handle = createDatabase(inject("databaseUrl"), { max: 10, silenceNotices: true });
});
afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  clock.set(START);
  calls = [];
  provider = new MidtransPaymentProvider({ serverKey: KEY, environment: "sandbox", now: () => clock.now(), fetch: (async (url: string, init?: RequestInit) => stubFetch(url, init)) as unknown as typeof fetch });
  await handle.db.execute(sql`TRUNCATE orders, pickup_dates, product_images, products, categories, settings, rate_limits, audit_logs, payment_webhook_events RESTART IDENTITY CASCADE`);
  const [cat] = await handle.db.insert(categories).values({ name: "Cakes", slug: "cakes" }).returning({ id: categories.id });
  const [p] = await handle.db.insert(products).values({ categoryId: cat!.id, name: "Brownies", slug: "brownies", price: 10_000, productType: "READY_STOCK" }).returning({ id: products.id });
  productId = p!.id;
});

const deps = () => ({ db: handle.db, clock, provider });

/** A website QRIS order for Rp10.000 with its QR created through Midtrans; returns our transaction id (= Midtrans order_id). */
async function qrisOrder() {
  const placed = await placeOrder(
    { db: handle.db, clock, publicBucket: { publicUrl: (k) => k } },
    { items: [{ productId, quantity: 1 }], customerName: "Sari", whatsapp: "081234567890", notes: "", pickupDate: "2026-10-03", paymentMethod: "QRIS", paymentOption: "FULL" },
    { idempotencyKey: randomUUID(), clientIp: randomUUID() },
  );
  if (!placed.ok) throw new Error(JSON.stringify(placed));
  const qr = await requestQrisPayment(deps(), placed.order.orderId);
  if (!qr.ok) throw new Error(qr.error);
  return { orderId: placed.order.orderId, transactionId: qr.qris.transactionId };
}

/** Status API reply for our transaction (HTTP 200 with Midtrans' own status_code, like the sandbox). */
function status(orderId: string, transactionStatus: string, statusCode: string, over: Record<string, string> = {}) {
  statusReply = {
    status: 200,
    body: { status_code: statusCode, transaction_id: MIDTRANS_TX, order_id: orderId, gross_amount: "10000.00", currency: "IDR", payment_type: "qris", transaction_status: transactionStatus, fraud_status: "accept", ...over },
  };
}

/** HTTP notification as Midtrans posts it, signed with the server key unless a signature is given. */
function notification(orderId: string, transactionStatus: string, statusCode: string, over: Record<string, string> = {}) {
  const body: Record<string, string> = {
    transaction_time: "2026-10-02 10:01:00",
    transaction_status: transactionStatus,
    transaction_id: MIDTRANS_TX,
    status_message: "midtrans payment notification",
    status_code: statusCode,
    payment_type: "qris",
    order_id: orderId,
    merchant_id: "G000000000",
    gross_amount: "10000.00",
    fraud_status: "accept",
    currency: "IDR",
    acquirer: "gopay",
    ...over,
  };
  body.signature_key ??= midtransSignature(body.order_id!, body.status_code!, body.gross_amount!, KEY);
  return new Request("https://staging.example.test/api/webhooks/payments/midtrans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

const orderRow = async (id: string) => (await handle.db.select().from(orders).where(eq(orders.id, id)))[0]!;
const txRow = async (id: string) => (await handle.db.select().from(paymentTransactions).where(eq(paymentTransactions.id, id)))[0]!;
const events = () => handle.db.select().from(paymentWebhookEvents);
const auditOf = (entityId: string) => handle.db.select().from(auditLogs).where(eq(auditLogs.entityId, entityId)).orderBy(auditLogs.id);
const statusCalls = () => calls.filter((c) => c.endsWith("/status"));

async function snapshot(o: { orderId: string; transactionId: string }) {
  return { order: await orderRow(o.orderId), tx: await txRow(o.transactionId), orderAudit: await auditOf(o.orderId), txAudit: await auditOf(o.transactionId) };
}

describe("Midtrans notification → verified webhook (real adapter, stubbed network)", () => {
  it("settlement: re-checked with the status API, then PAID and CONFIRMED by SYSTEM, audited once", async () => {
    const o = await qrisOrder();
    status(o.transactionId, "settlement", "200", { settlement_time: "2026-10-02 10:05:00" });
    expect(await processPaymentWebhook(deps(), notification(o.transactionId, "settlement", "200", { settlement_time: "2026-10-02 10:05:00" }))).toEqual({
      status: 200,
      outcome: "PAID_ORDER_CONFIRMED",
    });

    expect(statusCalls()).toEqual([`GET https://api.sandbox.midtrans.com/v2/${o.transactionId}/status`]);
    expect(await txRow(o.transactionId)).toMatchObject({ provider: "midtrans", providerReference: o.transactionId, status: "PAID", amount: 10_000, isException: false, paidAt: new Date("2026-10-02T03:05:00Z") });
    expect(await orderRow(o.orderId)).toMatchObject({ orderStatus: "CONFIRMED", paymentStatus: "PAID", paidAmount: 10_000, remainingAmount: 0 });
    expect(await events()).toEqual([expect.objectContaining({ provider: "midtrans", providerEventKey: `${MIDTRANS_TX}:settlement:accept`, signatureValid: true, processingResult: "PAID_ORDER_CONFIRMED" })]);
    expect((await auditOf(o.transactionId)).map((a) => [a.eventType, a.actorType])).toEqual([
      ["QRIS_CREATED", "CUSTOMER"],
      ["PAYMENT_CONFIRMED", "SYSTEM"],
    ]);
    const statusChanges = await handle.db.select().from(auditLogs).where(and(eq(auditLogs.entityId, o.orderId), eq(auditLogs.eventType, "ORDER_STATUS_CHANGED")));
    expect(statusChanges).toEqual([expect.objectContaining({ actorType: "SYSTEM", oldValue: { orderStatus: "NEW" }, newValue: { orderStatus: "CONFIRMED" } })]);

    // Midtrans retrying the same notification changes nothing (EC-05).
    expect(await processPaymentWebhook(deps(), notification(o.transactionId, "settlement", "200", { settlement_time: "2026-10-02 10:05:00" }))).toEqual({ status: 200, outcome: "DUPLICATE_EVENT" });
    expect(await events()).toHaveLength(1);
    expect((await auditOf(o.transactionId)).filter((a) => a.eventType === "PAYMENT_CONFIRMED")).toHaveLength(1);
  });

  it("pending (sent right after the QR is created): recorded as IGNORED, no state change", async () => {
    const o = await qrisOrder();
    const before = await snapshot(o);
    status(o.transactionId, "pending", "201");
    expect(await processPaymentWebhook(deps(), notification(o.transactionId, "pending", "201"))).toEqual({ status: 200, outcome: "IGNORED" });

    expect(await events()).toEqual([expect.objectContaining({ providerEventKey: `${MIDTRANS_TX}:pending:accept`, signatureValid: true, processingResult: "IGNORED" })]);
    expect(await snapshot(o)).toEqual(before);
    expect(before.tx.status).toBe("WAITING_PAYMENT");
    expect(before.order).toMatchObject({ orderStatus: "NEW", paymentStatus: "WAITING_PAYMENT", paidAmount: 0 });

    // The later settlement for the same Midtrans transaction is a different event and still applies.
    status(o.transactionId, "settlement", "200", { settlement_time: "2026-10-02 10:05:00" });
    expect((await processPaymentWebhook(deps(), notification(o.transactionId, "settlement", "200"))).outcome).toBe("PAID_ORDER_CONFIRMED");
  });

  it("expire: only the transaction expires (audited by SYSTEM); the order keeps its reservation and a new QR can be made (FD-112)", async () => {
    const o = await qrisOrder();
    const reservation = (await orderRow(o.orderId)).reservationExpiresAt;
    // Midtrans answers 407 with transaction_status "expire" for an expired QR.
    status(o.transactionId, "expire", "407");
    expect(await processPaymentWebhook(deps(), notification(o.transactionId, "expire", "407"))).toEqual({ status: 200, outcome: "EXPIRED" });

    expect(await txRow(o.transactionId)).toMatchObject({ status: "EXPIRED", paidAt: null });
    // The order's payment status only becomes EXPIRED with the order itself (payment-status.ts):
    // while the reservation runs, the customer can still pay with a new QR.
    expect(await orderRow(o.orderId)).toMatchObject({ orderStatus: "NEW", paymentStatus: "WAITING_PAYMENT", paidAmount: 0, remainingAmount: 10_000, cancellationReason: null, reservationExpiresAt: reservation });
    expect(await events()).toEqual([expect.objectContaining({ providerEventKey: `${MIDTRANS_TX}:expire:accept`, signatureValid: true, processingResult: "EXPIRED" })]);
    expect((await auditOf(o.transactionId)).map((a) => [a.eventType, a.actorType, a.newValue])).toEqual([
      ["QRIS_CREATED", "CUSTOMER", expect.anything()],
      ["PAYMENT_EXPIRED", "SYSTEM", { orderId: o.orderId }],
    ]);
    expect(await auditOf(o.orderId)).toEqual([expect.objectContaining({ eventType: "ORDER_CREATED" })]); // no order transition

    // A repeated expire for an already-expired transaction is ignored, not re-audited.
    expect((await processPaymentWebhook(deps(), notification(o.transactionId, "expire", "407", { fraud_status: "" }))).outcome).toBe("IGNORED");
    expect((await auditOf(o.transactionId)).filter((a) => a.eventType === "PAYMENT_EXPIRED")).toHaveLength(1);

    clock.set(new Date(START.getTime() + 5 * 60_000));
    const again = await requestQrisPayment(deps(), o.orderId);
    expect(again.ok && again.qris.transactionId).not.toBe(o.transactionId);
    expect(await orderRow(o.orderId)).toMatchObject({ orderStatus: "NEW", paymentStatus: "WAITING_PAYMENT" });
  });

  it("deny: the transaction becomes FAILED (audited), the order stays NEW", async () => {
    const o = await qrisOrder();
    status(o.transactionId, "deny", "202", { fraud_status: "deny" });
    expect(await processPaymentWebhook(deps(), notification(o.transactionId, "deny", "202", { fraud_status: "deny" }))).toEqual({ status: 200, outcome: "FAILED" });

    expect(await txRow(o.transactionId)).toMatchObject({ status: "FAILED", paidAt: null });
    expect(await orderRow(o.orderId)).toMatchObject({ orderStatus: "NEW", paymentStatus: "FAILED", paidAmount: 0 });
    expect((await auditOf(o.transactionId)).map((a) => [a.eventType, a.actorType])).toEqual([
      ["QRIS_CREATED", "CUSTOMER"],
      ["PAYMENT_FAILED", "SYSTEM"],
    ]);
  });

  it.each([
    ["401 (server key or PAYMENT_ENV mismatch)", 401, { status_code: "401", status_message: "Access denied, please check client or server key" }],
    ["429 (rate limited)", 429, { status_code: "429", status_message: "Too many requests" }],
  ])("status API %s → 503 without consuming the event; Midtrans' retry then applies the payment", async (_label, httpStatus, body) => {
    const o = await qrisOrder();
    const before = await snapshot(o);
    statusReply = { status: httpStatus, body };
    expect(await processPaymentWebhook(deps(), notification(o.transactionId, "settlement", "200"))).toEqual({ status: 503, outcome: "PROVIDER_UNAVAILABLE" });
    expect(await events()).toHaveLength(0);
    expect(await snapshot(o)).toEqual(before);

    status(o.transactionId, "settlement", "200", { settlement_time: "2026-10-02 10:05:00" });
    expect(await processPaymentWebhook(deps(), notification(o.transactionId, "settlement", "200"))).toEqual({ status: 200, outcome: "PAID_ORDER_CONFIRMED" });
    expect(await txRow(o.transactionId)).toMatchObject({ status: "PAID" });
  });

  it("status API 404: recorded as UNKNOWN_REFERENCE and never applied, even for a transaction we have", async () => {
    const o = await qrisOrder();
    const before = await snapshot(o);
    statusReply = { status: 404, body: { status_code: "404", status_message: "Transaction doesn't exist." } };
    expect(await processPaymentWebhook(deps(), notification(o.transactionId, "settlement", "200"))).toEqual({ status: 200, outcome: "UNKNOWN_REFERENCE" });
    expect(await events()).toEqual([expect.objectContaining({ signatureValid: true, processingResult: "UNKNOWN_REFERENCE" })]);
    expect(await snapshot(o)).toEqual(before);

    // A signed notification for an order_id that is not ours at all.
    const other = randomUUID();
    expect(await processPaymentWebhook(deps(), notification(other, "settlement", "200", { transaction_id: randomUUID() }))).toEqual({ status: 200, outcome: "UNKNOWN_REFERENCE" });
    expect(await snapshot(o)).toEqual(before);
  });

  it("invalid or missing signature: 401, recorded with signature_valid=false, status API never called, nothing changes", async () => {
    const o = await qrisOrder();
    const before = await snapshot(o);
    status(o.transactionId, "settlement", "200");

    const tampered = notification(o.transactionId, "settlement", "200", { gross_amount: "1.00", signature_key: midtransSignature(o.transactionId, "200", "10000.00", KEY) });
    const otherKey = notification(o.transactionId, "settlement", "200", { signature_key: midtransSignature(o.transactionId, "200", "10000.00", "SB-Mid-server-SOME-OTHER-KEY") });
    const unsigned = new Request("https://staging.example.test/api/webhooks/payments/midtrans", {
      method: "POST",
      body: JSON.stringify({ order_id: o.transactionId, status_code: "200", gross_amount: "10000.00", transaction_status: "settlement", transaction_id: MIDTRANS_TX }),
    });
    for (const request of [tampered, otherKey, unsigned]) {
      expect(await processPaymentWebhook(deps(), request)).toEqual({ status: 401, outcome: "INVALID_SIGNATURE" });
    }

    expect(statusCalls()).toEqual([]);
    expect((await events()).map((e) => [e.signatureValid, e.processingResult]).sort()).toEqual([
      [false, "INVALID_SIGNATURE"],
      [false, "INVALID_SIGNATURE"],
      [false, "MISSING_SIGNATURE"],
    ]);
    expect(await snapshot(o)).toEqual(before);
    expect(await handle.db.select().from(paymentExceptions)).toHaveLength(0);
  });
});
