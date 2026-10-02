import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import { createFixedClock } from "@/server/clock";
import { createDatabase, type DatabaseHandle } from "@/server/db/client";
import { admins, auditLogs, categories, orders, paymentExceptions, paymentProofs, paymentTransactions, paymentWebhookEvents, pickupDates, products, refunds, settings } from "@/server/db/schema";
import { parseIsoDate } from "@/server/domain/time/wib";
import { MockPaymentProvider } from "@/server/payments/mock-provider";
import { PaymentProviderError, type PaymentProvider } from "@/server/payments/types";
import { countActiveOrders } from "@/server/services/capacity";
import { expireDueReservations, expireIfDue, transitionOrder } from "@/server/services/order-lifecycle";
import { approvePaymentProof, completeRefund, getPaymentQueue, markCashPaid, recordRefund, rejectPaymentProof, resolvePaymentException } from "@/server/services/payment-admin";
import { processPaymentWebhook } from "@/server/services/payment-webhook";
import { getCustomerPaymentState, requestQrisPayment, startTransferRemainingPayment, uploadPaymentProof } from "@/server/services/payments";
import { placeOrder, type PlacedOrder } from "@/server/services/place-order";

let handle: DatabaseHandle;
const ids: Record<string, string> = {};
const START = new Date("2026-10-02T03:00:00Z"); // 10:00 WIB
const clock = createFixedClock(START);
const ADMIN_ID = "admin-pay-1";
let provider: MockPaymentProvider;
const deps = () => ({ db: handle.db, clock, provider });
const stored = new Map<string, Uint8Array>();
const bucket = {
  put: async (key: string, body: Uint8Array) => {
    stored.set(key, body);
    return { key, contentType: "", size: body.byteLength };
  },
  delete: async (key: string) => void stored.delete(key),
};
const proofDeps = () => ({ db: handle.db, clock, privateBucket: bucket });
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const PDF = new TextEncoder().encode("%PDF-1.4 bukti");
const minutes = (n: number) => new Date(START.getTime() + n * 60_000);

beforeAll(() => {
  handle = createDatabase(inject("databaseUrl"), { max: 20, silenceNotices: true });
});
afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  clock.set(START);
  stored.clear();
  provider = new MockPaymentProvider({ webhookSecret: "integration-webhook-secret", now: () => clock.now() });
  await handle.db.execute(
    sql`TRUNCATE orders, pickup_dates, product_images, products, categories, settings, rate_limits, audit_logs, payment_webhook_events, admin_sessions, admin_accounts, admins RESTART IDENTITY CASCADE`,
  );
  await handle.db.insert(admins).values({ id: ADMIN_ID, name: "Admin Bayar", email: "bayar@example.test" });
  const [cat] = await handle.db.insert(categories).values({ name: "Cakes", slug: "cakes" }).returning({ id: categories.id });
  const rows = await handle.db
    .insert(products)
    .values([
      { categoryId: cat!.id, name: "Brownies", slug: "brownies", price: 85_000, productType: "READY_STOCK" },
      { categoryId: cat!.id, name: "Odd", slug: "odd", price: 125_555, productType: "PRE_ORDER", minimumPreorderDays: 2 },
    ])
    .returning({ id: products.id, slug: products.slug });
  for (const r of rows) ids[r.slug] = r.id;
});

async function order(over: Record<string, unknown> = {}): Promise<PlacedOrder> {
  const r = await placeOrder(
    { db: handle.db, clock, publicBucket: { publicUrl: (k) => k } },
    {
      items: [{ productId: ids.odd, quantity: 1 }],
      customerName: "Sari",
      whatsapp: "081234567890",
      notes: "",
      pickupDate: "2026-10-05",
      paymentMethod: "QRIS",
      paymentOption: "DP_50",
      ...over,
    },
    { idempotencyKey: randomUUID(), clientIp: randomUUID() },
  );
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.order;
}

const row = async (id: string) => (await handle.db.select().from(orders).where(eq(orders.id, id)))[0]!;
const txsOf = (orderId: string) => handle.db.select().from(paymentTransactions).where(eq(paymentTransactions.orderId, orderId));
const exceptionsOf = (orderId: string) => handle.db.select().from(paymentExceptions).where(eq(paymentExceptions.orderId, orderId));

async function qris(orderId: string) {
  const r = await requestQrisPayment(deps(), orderId);
  if (!r.ok) throw new Error(r.error);
  return r.qris;
}

async function pay(providerReference: string, outcome: "PAID" | "FAILED" | "EXPIRED" = "PAID", opts: { eventId?: string; amount?: number } = {}) {
  return processPaymentWebhook(deps(), provider.simulatePayment(providerReference, outcome, opts));
}

const refOf = async (transactionId: string) => (await handle.db.select().from(paymentTransactions).where(eq(paymentTransactions.id, transactionId)))[0]!.providerReference!;

describe("QRIS initial payment (§16, FD-111)", () => {
  it("DP: QR valid until reservation − buffer; verified webhook → PARTIALLY_PAID and Dikonfirmasi by SYSTEM", async () => {
    const o = await order();
    const q = await qris(o.orderId);
    expect(q).toMatchObject({ amount: 62_778, purpose: "DP", expiresAt: minutes(28).toISOString() });
    // The checkout transaction got the QR; no second transaction.
    expect(await txsOf(o.orderId)).toHaveLength(1);
    // Asking again re-uses the same QR.
    expect((await qris(o.orderId)).transactionId).toBe(q.transactionId);

    clock.set(minutes(5));
    expect(await pay(await refOf(q.transactionId))).toEqual({ status: 200, outcome: "PAID_ORDER_CONFIRMED" });
    expect(await row(o.orderId)).toMatchObject({ orderStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID", paidAmount: 62_778, remainingAmount: 62_777 });
    const audit = await handle.db.select().from(auditLogs).where(and(eq(auditLogs.entityId, o.orderId), eq(auditLogs.eventType, "ORDER_STATUS_CHANGED")));
    expect(audit).toEqual([expect.objectContaining({ actorType: "SYSTEM", newValue: { orderStatus: "CONFIRMED" } })]);
  });

  it("FULL → PAID", async () => {
    const o = await order({ paymentOption: "FULL" });
    const q = await qris(o.orderId);
    expect(q.amount).toBe(125_555);
    await pay(await refOf(q.transactionId));
    expect(await row(o.orderId)).toMatchObject({ orderStatus: "CONFIRMED", paymentStatus: "PAID", remainingAmount: 0 });
  });

  it("duplicate webhook (same event) is processed once; a different event for a paid transaction is a no-op (EC-05)", async () => {
    const o = await order();
    const q = await qris(o.orderId);
    const ref = await refOf(q.transactionId);
    const first = provider.simulatePayment(ref, "PAID", { eventId: "evt-1" });
    const body = await first.clone().text();
    const replay = () => new Request(first.url, { method: "POST", headers: first.headers, body });

    const results = await Promise.all([processPaymentWebhook(deps(), first), processPaymentWebhook(deps(), replay()), processPaymentWebhook(deps(), replay())]);
    expect(results.map((r) => r.outcome).sort()).toEqual(["DUPLICATE_EVENT", "DUPLICATE_EVENT", "PAID_ORDER_CONFIRMED"]);
    expect(await pay(ref, "PAID", { eventId: "evt-2" })).toEqual({ status: 200, outcome: "ALREADY_PROCESSED" });
    expect((await row(o.orderId)).paidAmount).toBe(62_778);
    expect(await handle.db.select().from(paymentWebhookEvents)).toHaveLength(2);
  });

  it("rejects bad signatures (401) and never trusts a body the provider API does not confirm", async () => {
    const o = await order();
    const q = await qris(o.orderId);
    const ref = await refOf(q.transactionId);
    const real = provider.simulatePayment(ref, "PAID");
    const forged = new Request(real.url, { method: "POST", headers: { "x-mock-signature": "0".repeat(64) }, body: await real.text() });
    expect(await processPaymentWebhook(deps(), forged)).toEqual({ status: 401, outcome: "INVALID_SIGNATURE" });

    // Signed "PAID" but the provider API still says PENDING → not applied.
    const other = new MockPaymentProvider({ webhookSecret: "integration-webhook-secret", now: () => clock.now() });
    const spoof = await other.createQris({ transactionId: "x", amount: 62_778, expiresAt: minutes(20) });
    const signedByOther = other.simulatePayment(spoof.providerReference, "PAID");
    expect((await processPaymentWebhook(deps(), signedByOther)).outcome).toBe("UNKNOWN_REFERENCE");
    const pendingProvider: PaymentProvider = {
      name: "mock",
      createQris: provider.createQris.bind(provider),
      parseAndVerifyWebhook: provider.parseAndVerifyWebhook.bind(provider),
      getTransactionStatus: async (r) => ({ providerReference: r, status: "PENDING", amount: 62_778, paidAt: null }),
    };
    const req = provider.simulatePayment(ref, "PAID");
    expect((await processPaymentWebhook({ ...deps(), provider: pendingProvider }, req)).outcome).toBe("STATUS_NOT_CONFIRMED");
    expect((await row(o.orderId)).paymentStatus).toBe("WAITING_PAYMENT");
  });

  it("provider status API down → 503 so the gateway retries; event not consumed", async () => {
    const o = await order();
    const q = await qris(o.orderId);
    const ref = await refOf(q.transactionId);
    const down: PaymentProvider = {
      ...provider,
      name: "mock",
      createQris: provider.createQris.bind(provider),
      parseAndVerifyWebhook: provider.parseAndVerifyWebhook.bind(provider),
      getTransactionStatus: async () => {
        throw new PaymentProviderError("PROVIDER_UNAVAILABLE", "down");
      },
    };
    const req = provider.simulatePayment(ref, "PAID", { eventId: "evt-retry" });
    const body = await req.clone().text();
    expect(await processPaymentWebhook({ ...deps(), provider: down }, req)).toEqual({ status: 503, outcome: "PROVIDER_UNAVAILABLE" });
    const retry = new Request(req.url, { method: "POST", headers: req.headers, body });
    expect((await processPaymentWebhook(deps(), retry)).outcome).toBe("PAID_ORDER_CONFIRMED");
  });

  it("amount mismatch → Payment Exception, not counted (EC-06, TD-13)", async () => {
    const o = await order();
    const q = await qris(o.orderId);
    const ref = await refOf(q.transactionId);
    const lying: PaymentProvider = {
      name: "mock",
      createQris: provider.createQris.bind(provider),
      parseAndVerifyWebhook: provider.parseAndVerifyWebhook.bind(provider),
      getTransactionStatus: async (r) => ({ providerReference: r, status: "PAID", amount: 1_000, paidAt: clock.now() }),
    };
    expect((await processPaymentWebhook({ ...deps(), provider: lying }, provider.simulatePayment(ref, "PAID"))).outcome).toBe("EXCEPTION_AMOUNT_MISMATCH");
    expect(await row(o.orderId)).toMatchObject({ paidAmount: 0, orderStatus: "NEW" });
    expect(await exceptionsOf(o.orderId)).toEqual([expect.objectContaining({ kind: "AMOUNT_MISMATCH", status: "OPEN" })]);
  });

  it("failed QRIS → FAILED; a new QRIS can be created; reservation is not extended (FD-112, DI-08)", async () => {
    const o = await order();
    const first = await qris(o.orderId);
    expect((await pay(await refOf(first.transactionId), "FAILED")).outcome).toBe("FAILED");
    expect(await row(o.orderId)).toMatchObject({ orderStatus: "NEW", paymentStatus: "FAILED" });
    expect((await getCustomerPaymentState(handle.db, o.orderId, clock))?.lastAttempt).toBe("FAILED");

    clock.set(minutes(10));
    const second = await qris(o.orderId);
    expect(second.transactionId).not.toBe(first.transactionId);
    expect(second.expiresAt).toBe(minutes(28).toISOString());
    expect((await row(o.orderId)).reservationExpiresAt?.toISOString()).toBe(minutes(30).toISOString());
    await pay(await refOf(second.transactionId));
    expect((await row(o.orderId)).paymentStatus).toBe("PARTIALLY_PAID");
  });

  it("no QR in the last minutes before the reservation ends; provider down never marks paid (EC-13)", async () => {
    const o = await order();
    const failing: PaymentProvider = {
      name: "mock",
      createQris: async () => {
        throw new PaymentProviderError("PROVIDER_UNAVAILABLE", "down");
      },
      parseAndVerifyWebhook: provider.parseAndVerifyWebhook.bind(provider),
      getTransactionStatus: provider.getTransactionStatus.bind(provider),
    };
    expect(await requestQrisPayment({ ...deps(), provider: failing }, o.orderId)).toEqual({ ok: false, error: "PROVIDER_UNAVAILABLE" });
    expect(await txsOf(o.orderId)).toEqual([expect.objectContaining({ status: "WAITING_PAYMENT", providerReference: null })]);
    clock.set(minutes(29));
    expect(await requestQrisPayment(deps(), o.orderId)).toEqual({ ok: false, error: "RESERVATION_EXPIRED" });
  });
});

describe("expiry and late payments (FD-56, FD-107, FD-118)", () => {
  it("late webhook after expiry → exception LATE_PAYMENT_AFTER_CANCEL; order stays Dibatalkan; slot stays free", async () => {
    await handle.db.insert(pickupDates).values({ date: "2026-10-05", capacityOverride: 1 });
    const o = await order();
    const q = await qris(o.orderId);
    clock.set(minutes(31)); // not swept yet: the webhook runs expireIfDue itself (§16 step 6)
    expect((await pay(await refOf(q.transactionId))).outcome).toBe("EXCEPTION_LATE_PAYMENT");
    expect(await row(o.orderId)).toMatchObject({ orderStatus: "CANCELLED", cancellationReason: "PAYMENT_EXPIRED", paidAmount: 0, paymentStatus: "EXPIRED" });
    expect(await txsOf(o.orderId)).toEqual([expect.objectContaining({ status: "PAID", isException: true })]);
    expect(await exceptionsOf(o.orderId)).toEqual([expect.objectContaining({ kind: "LATE_PAYMENT_AFTER_CANCEL", status: "OPEN" })]);
    expect((await countActiveOrders(handle.db, [parseIsoDate("2026-10-05")], clock.now())).get(parseIsoDate("2026-10-05")) ?? 0).toBe(0);
    expect(await transitionOrder(handle.db, { orderId: o.orderId, to: "CONFIRMED", actor: { type: "ADMIN", adminId: ADMIN_ID } }, clock)).toMatchObject({ ok: false });

    // Resolution: refund record; no reinstate.
    const queue = await getPaymentQueue(handle.db);
    const exc = queue.exceptions.find((e) => e.orderId === o.orderId)!;
    expect(await resolvePaymentException(handle.db, { exceptionId: exc.exceptionId, adminId: ADMIN_ID, resolution: "REFUNDED", note: "  " }, clock)).toEqual({ ok: false, error: "NOTE_REQUIRED" });
    expect((await resolvePaymentException(handle.db, { exceptionId: exc.exceptionId, adminId: ADMIN_ID, resolution: "REFUNDED", note: "Transfer balik ke customer" }, clock)).ok).toBe(true);
    expect(await handle.db.select().from(refunds).where(eq(refunds.orderId, o.orderId))).toEqual([expect.objectContaining({ amount: 62_778, status: "COMPLETED", recordedByAdminId: ADMIN_ID })]);
    expect((await exceptionsOf(o.orderId))[0]).toMatchObject({ status: "RESOLVED", resolution: "REFUNDED" });
    expect((await row(o.orderId)).orderStatus).toBe("CANCELLED");
  });

  it("webhook and expiry sweeper racing on the deadline: the order ends in exactly one consistent state", async () => {
    const o = await order();
    const q = await qris(o.orderId);
    const ref = await refOf(q.transactionId);
    clock.set(minutes(30));
    const [hook] = await Promise.all([pay(ref), expireDueReservations(handle.db, clock)]);
    const r = await row(o.orderId);
    if (hook.outcome === "EXCEPTION_LATE_PAYMENT") expect(r).toMatchObject({ orderStatus: "CANCELLED", paidAmount: 0 });
    else expect(r).toMatchObject({ orderStatus: "CONFIRMED", paidAmount: 62_778 });
  });

  it("paying an old QR after the order is fully paid → DUPLICATE_PAYMENT exception (TD-20)", async () => {
    const o = await order({ paymentOption: "FULL" });
    const first = await qris(o.orderId);
    const firstRef = await refOf(first.transactionId);
    await pay(firstRef, "FAILED");
    const second = await qris(o.orderId);
    await pay(await refOf(second.transactionId));
    // The customer had also paid the first QR (provider later settles it).
    expect((await pay(firstRef, "PAID")).outcome).toBe("EXCEPTION_DUPLICATE_PAYMENT");
    expect(await row(o.orderId)).toMatchObject({ paidAmount: 125_555, paymentStatus: "PAID" });
  });
});

describe("DP remaining payment (FD-46, FD-109, TD-09, DI-01)", () => {
  async function dpPaidOrder() {
    const o = await order();
    const q = await qris(o.orderId);
    await pay(await refOf(q.transactionId));
    return o;
  }

  it("QRIS remaining uses its own duration; paying it → PAID; Selesai becomes possible", async () => {
    await handle.db.insert(settings).values({ key: "qris_remaining_payment_minutes", value: 45 });
    const o = await dpPaidOrder();
    clock.set(minutes(60)); // after the original reservation: irrelevant now
    const rem = await qris(o.orderId);
    expect(rem).toMatchObject({ purpose: "REMAINING", amount: 62_777, expiresAt: minutes(105).toISOString() });
    expect((await row(o.orderId)).reservationExpiresAt?.toISOString()).toBe(minutes(30).toISOString());
    await pay(await refOf(rem.transactionId));
    expect(await row(o.orderId)).toMatchObject({ paymentStatus: "PAID", paidAmount: 125_555, remainingAmount: 0, orderStatus: "CONFIRMED" });

    const admin = { type: "ADMIN" as const, adminId: ADMIN_ID };
    for (const to of ["PROCESSING", "READY_FOR_PICKUP", "COMPLETED"] as const) expect((await transitionOrder(handle.db, { orderId: o.orderId, to, actor: admin }, clock)).ok).toBe(true);
  });

  it("expired remaining transaction: only the transaction expires; order stays active; a new one can be made", async () => {
    const o = await dpPaidOrder();
    const rem = await qris(o.orderId);
    clock.set(minutes(40)); // 30-minute remaining duration passed
    expect((await expireDueReservations(handle.db, clock)).remainingPaymentsExpired).toBe(1);
    expect((await txsOf(o.orderId)).find((t) => t.id === rem.transactionId)?.status).toBe("EXPIRED");
    expect(await row(o.orderId)).toMatchObject({ orderStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID" });
    expect((await qris(o.orderId)).transactionId).not.toBe(rem.transactionId);
  });

  it("switching to transfer retires the pending remaining QR; proof → verify → PAID", async () => {
    const o = await dpPaidOrder();
    await qris(o.orderId);
    const t = await startTransferRemainingPayment({ db: handle.db, clock }, o.orderId);
    expect(t.ok).toBe(true);
    const all = await txsOf(o.orderId);
    expect(all.filter((x) => x.purpose === "REMAINING").map((x) => [x.method, x.status]).sort()).toEqual([
      ["BANK_TRANSFER", "WAITING_PAYMENT"],
      ["QRIS", "VOIDED"],
    ]);
    const up = await uploadPaymentProof(proofDeps(), { orderId: o.orderId, bytes: PDF, actor: { type: "CUSTOMER" } });
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    expect((await row(o.orderId)).paymentStatus).toBe("PARTIALLY_PAID");
    expect(await approvePaymentProof(handle.db, { proofId: up.proofId, adminId: ADMIN_ID }, clock)).toEqual({ ok: true, orderConfirmed: false, exception: false });
    expect(await row(o.orderId)).toMatchObject({ paymentStatus: "PAID", remainingAmount: 0 });
  });

  it("nothing to pay once PAID; Cash is never offered for remaining (FD-109)", async () => {
    const o = await order({ paymentOption: "FULL" });
    await pay(await refOf((await qris(o.orderId)).transactionId));
    expect(await requestQrisPayment(deps(), o.orderId)).toEqual({ ok: false, error: "ALREADY_PAID" });
    expect(await markCashPaid(handle.db, { orderId: o.orderId, adminId: ADMIN_ID }, clock)).toEqual({ ok: false, error: "NOT_CASH" });
  });
});

describe("bank transfer proof (§17, FD-50, FD-106, FD-120)", () => {
  const transferOrder = () => order({ paymentMethod: "BANK_TRANSFER" });

  it("validates files by magic bytes and size; stores privately; WAITING_VERIFICATION pauses expiry", async () => {
    const o = await transferOrder();
    const html = new TextEncoder().encode("<html><script>alert(1)</script>");
    expect(await uploadPaymentProof(proofDeps(), { orderId: o.orderId, bytes: html, actor: { type: "CUSTOMER" } })).toEqual({ ok: false, error: "UNSUPPORTED_TYPE" });
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect(await uploadPaymentProof(proofDeps(), { orderId: o.orderId, bytes: big, actor: { type: "CUSTOMER" } })).toEqual({ ok: false, error: "TOO_LARGE" });
    expect(stored.size).toBe(0);

    const up = await uploadPaymentProof(proofDeps(), { orderId: o.orderId, bytes: PNG, actor: { type: "CUSTOMER" } });
    expect(up.ok).toBe(true);
    const [proof] = await handle.db.select().from(paymentProofs).where(eq(paymentProofs.orderId, o.orderId));
    expect(proof).toMatchObject({ mimeType: "image/png", verificationStatus: "PENDING" });
    expect(proof!.storageKey).toMatch(new RegExp(`^proofs/${o.orderId}/[0-9a-f-]{36}\\.png$`));
    expect(await row(o.orderId)).toMatchObject({ paymentStatus: "WAITING_VERIFICATION" });
    expect(await uploadPaymentProof(proofDeps(), { orderId: o.orderId, bytes: PNG, actor: { type: "CUSTOMER" } })).toEqual({ ok: false, error: "PROOF_UNDER_REVIEW" });

    clock.set(minutes(500)); // far past the 120-minute reservation
    expect(await expireIfDue(handle.db, o.orderId, clock)).toBe(false);
    expect((await row(o.orderId)).orderStatus).toBe("NEW");
  });

  it("approve → paid + Dikonfirmasi by admin; second approve is refused", async () => {
    const o = await transferOrder();
    const up = await uploadPaymentProof(proofDeps(), { orderId: o.orderId, bytes: PDF, actor: { type: "CUSTOMER" } });
    if (!up.ok) throw new Error(up.error);
    expect(await approvePaymentProof(handle.db, { proofId: up.proofId, adminId: ADMIN_ID }, clock)).toEqual({ ok: true, orderConfirmed: true, exception: false });
    expect(await row(o.orderId)).toMatchObject({ orderStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID", paidAmount: 62_778 });
    expect((await txsOf(o.orderId))[0]).toMatchObject({ status: "PAID", verifiedByAdminId: ADMIN_ID });
    expect(await approvePaymentProof(handle.db, { proofId: up.proofId, adminId: ADMIN_ID }, clock)).toEqual({ ok: false, error: "NOT_PENDING" });
    const audit = await handle.db.select().from(auditLogs).where(and(eq(auditLogs.entityId, o.orderId), eq(auditLogs.eventType, "ORDER_STATUS_CHANGED")));
    expect(audit[0]).toMatchObject({ actorType: "ADMIN", actorAdminId: ADMIN_ID });
  });

  it("reject before the deadline → WAITING_PAYMENT with the original deadline; re-upload allowed", async () => {
    const o = await transferOrder();
    const up = await uploadPaymentProof(proofDeps(), { orderId: o.orderId, bytes: PDF, actor: { type: "CUSTOMER" } });
    if (!up.ok) throw new Error(up.error);
    expect(await rejectPaymentProof(handle.db, { proofId: up.proofId, adminId: ADMIN_ID, reason: "" }, clock)).toEqual({ ok: false, error: "REASON_REQUIRED" });
    clock.set(minutes(60));
    expect(await rejectPaymentProof(handle.db, { proofId: up.proofId, adminId: ADMIN_ID, reason: "Nominal tidak sesuai" }, clock)).toEqual({ ok: true, orderExpired: false });
    expect(await row(o.orderId)).toMatchObject({ orderStatus: "NEW", paymentStatus: "WAITING_PAYMENT", reservationExpiresAt: minutes(120) });
    expect((await txsOf(o.orderId))[0]).toMatchObject({ status: "WAITING_PAYMENT", expiresAt: minutes(120) });
    expect((await getCustomerPaymentState(handle.db, o.orderId, clock))?.lastProofRejected).toBe(true);
    expect((await uploadPaymentProof(proofDeps(), { orderId: o.orderId, bytes: PNG, actor: { type: "CUSTOMER" } })).ok).toBe(true);
  });

  it("reject after the deadline → order expires immediately and the slot is released (DI-07)", async () => {
    const o = await transferOrder();
    const up = await uploadPaymentProof(proofDeps(), { orderId: o.orderId, bytes: PDF, actor: { type: "CUSTOMER" } });
    if (!up.ok) throw new Error(up.error);
    clock.set(minutes(121));
    expect(await rejectPaymentProof(handle.db, { proofId: up.proofId, adminId: ADMIN_ID, reason: "Bukti tidak terbaca" }, clock)).toEqual({ ok: true, orderExpired: true });
    expect(await row(o.orderId)).toMatchObject({ orderStatus: "CANCELLED", paymentStatus: "EXPIRED", cancellationReason: "PAYMENT_EXPIRED" });
    expect(await uploadPaymentProof(proofDeps(), { orderId: o.orderId, bytes: PNG, actor: { type: "CUSTOMER" } })).toEqual({ ok: false, error: "PAYMENT_EXPIRED" });
  });

  it("upload after the deadline is refused and the order is expired (§17)", async () => {
    const o = await transferOrder();
    clock.set(minutes(121));
    expect(await uploadPaymentProof(proofDeps(), { orderId: o.orderId, bytes: PNG, actor: { type: "CUSTOMER" } })).toEqual({ ok: false, error: "PAYMENT_EXPIRED" });
    expect(stored.size).toBe(0);
    expect((await row(o.orderId)).orderStatus).toBe("CANCELLED");
  });

  it("QRIS is not offered for a transfer order's initial payment", async () => {
    const o = await transferOrder();
    expect(await requestQrisPayment(deps(), o.orderId)).toEqual({ ok: false, error: "METHOD_NOT_AVAILABLE" });
  });
});

describe("Cash (§18, FD-39, FD-57, FD-113)", () => {
  const cashOrder = () => order({ items: [{ productId: ids.brownies, quantity: 1 }], pickupDate: "2026-10-02", paymentMethod: "CASH", paymentOption: "FULL" });

  it("never expires, has no QRIS/transfer, and is marked paid once by an admin", async () => {
    const o = await cashOrder();
    clock.set(minutes(60 * 24 * 3));
    expect(await expireIfDue(handle.db, o.orderId, clock)).toBe(false);
    expect(await requestQrisPayment(deps(), o.orderId)).toEqual({ ok: false, error: "METHOD_NOT_AVAILABLE" });
    expect((await getCustomerPaymentState(handle.db, o.orderId, clock))?.stage).toBe("CASH_AT_PICKUP");

    expect(await markCashPaid(handle.db, { orderId: o.orderId, adminId: ADMIN_ID }, clock)).toEqual({ ok: true });
    expect(await markCashPaid(handle.db, { orderId: o.orderId, adminId: ADMIN_ID }, clock)).toEqual({ ok: false, error: "ALREADY_PAID" });
    expect(await row(o.orderId)).toMatchObject({ paymentStatus: "PAID", paidAmount: 85_000 });
    expect(await txsOf(o.orderId)).toEqual([expect.objectContaining({ method: "CASH", purpose: "FULL", amount: 85_000, status: "PAID", verifiedByAdminId: ADMIN_ID })]);
  });

  it("cannot be marked paid after cancellation (no-show)", async () => {
    const o = await cashOrder();
    await transitionOrder(handle.db, { orderId: o.orderId, to: "CANCELLED", actor: { type: "ADMIN", adminId: ADMIN_ID }, reason: "Tidak diambil" }, clock);
    expect(await markCashPaid(handle.db, { orderId: o.orderId, adminId: ADMIN_ID }, clock)).toEqual({ ok: false, error: "ORDER_CLOSED" });
  });
});

describe("refund records (FD-61–FD-64)", () => {
  it("cancelled paid order appears in the refund queue; partial then full refund → PARTIALLY_REFUNDED → REFUNDED", async () => {
    const o = await order({ paymentOption: "FULL" });
    await pay(await refOf((await qris(o.orderId)).transactionId));
    await transitionOrder(handle.db, { orderId: o.orderId, to: "CANCELLED", actor: { type: "ADMIN", adminId: ADMIN_ID }, reason: "Permintaan customer" }, clock);
    expect((await getPaymentQueue(handle.db)).refundCandidates.map((r) => r.orderId)).toContain(o.orderId);

    expect(await recordRefund(handle.db, { orderId: o.orderId, adminId: ADMIN_ID, amount: 200_000, reason: "x", status: "COMPLETED" }, clock)).toEqual({ ok: false, error: "EXCEEDS_REFUNDABLE" });
    const partial = await recordRefund(handle.db, { orderId: o.orderId, adminId: ADMIN_ID, amount: 50_000, reason: "Sebagian", status: "PENDING" }, clock);
    expect(partial.ok).toBe(true);
    expect((await row(o.orderId)).paymentStatus).toBe("PAID"); // pending refunds do not count yet
    if (partial.ok) await completeRefund(handle.db, { refundId: partial.refundId, adminId: ADMIN_ID }, clock);
    expect((await row(o.orderId)).paymentStatus).toBe("PARTIALLY_REFUNDED");
    await recordRefund(handle.db, { orderId: o.orderId, adminId: ADMIN_ID, amount: 75_555, reason: "Sisa", status: "COMPLETED" }, clock);
    expect((await row(o.orderId)).paymentStatus).toBe("REFUNDED");
    expect((await getPaymentQueue(handle.db)).refundCandidates.map((r) => r.orderId)).not.toContain(o.orderId);
  });
});
