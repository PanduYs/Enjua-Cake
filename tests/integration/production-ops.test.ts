import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import { createFixedClock } from "@/server/clock";
import { createDatabase, type DatabaseHandle } from "@/server/db/client";
import { adminAccounts, adminSessions, auditLogs, categories, products, settings } from "@/server/db/schema";
import { goLiveChecklist } from "@/server/ops/go-live";
import { reconcilePayments, summarizeReconcile } from "@/server/ops/reconcile";
import { MockPaymentProvider } from "@/server/payments/mock-provider";
import { PaymentProviderError, type PaymentProvider } from "@/server/payments/types";
import { verifyPassword } from "@/server/security/password";
import { createAdminAccount } from "@/server/auth/admin-accounts";
import { resetAdminPasswordByEmail } from "@/server/services/admin-users";
import { requestQrisPayment } from "@/server/services/payments";
import { placeOrder } from "@/server/services/place-order";

let handle: DatabaseHandle;
const clock = createFixedClock(new Date("2026-10-02T03:00:00Z"));

beforeAll(() => {
  handle = createDatabase(inject("databaseUrl"), { max: 5, silenceNotices: true });
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  await handle.db.execute(sql`TRUNCATE orders, pickup_dates, product_images, products, categories, settings, rate_limits, audit_logs, payment_webhook_events, admin_sessions, admin_accounts, admins RESTART IDENTITY CASCADE`);
});

describe("go-live checklist (GL-01…GL-12)", () => {
  it("reports missing client data and sample data without filling anything in", async () => {
    const [cat] = await handle.db.insert(categories).values({ name: "Contoh", slug: "contoh" }).returning({ id: categories.id });
    await handle.db.insert(products).values({ categoryId: cat!.id, name: "Contoh Kue", slug: "contoh-kue", price: 1000, productType: "READY_STOCK" });
    await createAdminAccount(handle.db, { name: "Seed", email: "seed@example.test", password: "password-panjang-123" }, { type: "SYSTEM" });

    const items = Object.fromEntries((await goLiveChecklist(handle.db)).map((i) => [i.id, i.status]));
    expect(items).toMatchObject({ "GL-02": "SAMPLE_DATA", "GL-03": "MISSING", "GL-04": "MISSING", "GL-05": "MISSING", "GL-09": "MANUAL", ADMIN: "SAMPLE_DATA" });
    expect(await handle.db.select().from(settings)).toHaveLength(0); // read-only

    await handle.db.insert(settings).values([
      { key: "address", value: "Alamat dari klien" },
      { key: "whatsapp_number", value: "081200000000" },
    ]);
    const after = Object.fromEntries((await goLiveChecklist(handle.db)).map((i) => [i.id, i.status]));
    expect(after).toMatchObject({ "GL-03": "OK", "GL-04": "OK" });
  });
});

describe("payment reconciliation report (plan §38)", () => {
  it("an empty window (e.g. the wrong DATABASE_URL) is reported as such and is not a success unless allowed", async () => {
    const provider = new MockPaymentProvider({ webhookSecret: "reconcile-webhook-secret", now: () => clock.now() });
    const rows = await reconcilePayments(handle.db, provider);
    expect(rows).toEqual([]);
    expect(summarizeReconcile(rows)).toEqual({ checked: 0, mismatches: 0, unchecked: 0, empty: true, exitCode: 1 });
    expect(summarizeReconcile(rows, { allowEmpty: true }).exitCode).toBe(0);
  });

  it("finds QRIS payments the provider settled but the database missed (no webhook), changing nothing", async () => {
    const [cat] = await handle.db.insert(categories).values({ name: "C", slug: "c" }).returning({ id: categories.id });
    const [p] = await handle.db.insert(products).values({ categoryId: cat!.id, name: "K", slug: "k", price: 50_000, productType: "READY_STOCK" }).returning({ id: products.id });
    const provider = new MockPaymentProvider({ webhookSecret: "reconcile-webhook-secret", now: () => clock.now() });
    const order = await placeOrder(
      { db: handle.db, clock, publicBucket: { publicUrl: (k) => k } },
      { items: [{ productId: p!.id, quantity: 1 }], customerName: "S", whatsapp: "081234567890", notes: "", pickupDate: "2026-10-03", paymentMethod: "QRIS", paymentOption: "FULL" },
      { idempotencyKey: randomUUID(), clientIp: "r" },
    );
    if (!order.ok) throw new Error("order");
    const q = await requestQrisPayment({ db: handle.db, clock, provider }, order.order.orderId);
    if (!q.ok) throw new Error(q.error);
    const before = await reconcilePayments(handle.db, provider);
    expect(before).toEqual([expect.objectContaining({ dbStatus: "WAITING_PAYMENT", providerStatus: "PENDING", mismatch: false })]);
    expect(summarizeReconcile(before)).toEqual({ checked: 1, mismatches: 0, unchecked: 0, empty: false, exitCode: 0 });

    // Customer pays, but the webhook never arrives.
    const [{ ref }] = (await handle.db.execute<{ ref: string }>(sql`select provider_reference as ref from payment_transactions`)) as unknown as [{ ref: string }];
    provider.simulatePayment(ref, "PAID");
    const after = await reconcilePayments(handle.db, provider);
    expect(after).toEqual([expect.objectContaining({ orderNumber: order.order.orderNumber, providerStatus: "PAID", mismatch: true })]);
    expect(summarizeReconcile(after)).toEqual({ checked: 1, mismatches: 1, unchecked: 0, empty: false, exitCode: 1 });
    expect((await handle.db.execute(sql`select status from payment_transactions`))[0]).toMatchObject({ status: "WAITING_PAYMENT" });
  });

  it("a status that cannot be read (wrong key, provider down, unexpected error) fails the report instead of passing as 0 mismatches", async () => {
    const [cat] = await handle.db.insert(categories).values({ name: "C", slug: "c" }).returning({ id: categories.id });
    const [p] = await handle.db.insert(products).values({ categoryId: cat!.id, name: "K", slug: "k", price: 50_000, productType: "READY_STOCK" }).returning({ id: products.id });
    const provider = new MockPaymentProvider({ webhookSecret: "reconcile-webhook-secret", now: () => clock.now() });
    for (const n of [1, 2]) {
      const order = await placeOrder(
        { db: handle.db, clock, publicBucket: { publicUrl: (k) => k } },
        { items: [{ productId: p!.id, quantity: 1 }], customerName: `S${n}`, whatsapp: "081234567890", notes: "", pickupDate: "2026-10-03", paymentMethod: "QRIS", paymentOption: "FULL" },
        { idempotencyKey: randomUUID(), clientIp: `r${n}` },
      );
      if (!order.ok) throw new Error("order");
      const q = await requestQrisPayment({ db: handle.db, clock, provider }, order.order.orderId);
      if (!q.ok) throw new Error(q.error);
    }
    const failing = (error: Error): PaymentProvider => ({
      name: "mock",
      createQris: provider.createQris.bind(provider),
      parseAndVerifyWebhook: provider.parseAndVerifyWebhook.bind(provider),
      getTransactionStatus: async () => {
        throw error;
      },
    });

    // Midtrans 401 (key/environment mismatch) surfaces as PROVIDER_UNAVAILABLE.
    const unavailable = await reconcilePayments(handle.db, failing(new PaymentProviderError("PROVIDER_UNAVAILABLE", "Midtrans status 401")));
    expect(unavailable.map((r) => [r.providerStatus, r.mismatch])).toEqual([
      ["PROVIDER_UNAVAILABLE", false],
      ["PROVIDER_UNAVAILABLE", false],
    ]);
    expect(summarizeReconcile(unavailable)).toEqual({ checked: 0, mismatches: 0, unchecked: 2, empty: false, exitCode: 1 });

    const broken = await reconcilePayments(handle.db, failing(new Error("unexpected")));
    expect(summarizeReconcile(broken)).toEqual({ checked: 0, mismatches: 0, unchecked: 2, empty: false, exitCode: 1 });

    // One readable, one not: still incomplete.
    let calls = 0;
    const flaky: PaymentProvider = {
      ...failing(new Error("unused")),
      getTransactionStatus: async (ref) => {
        if (calls++ === 0) return provider.getTransactionStatus(ref);
        throw new PaymentProviderError("PROVIDER_UNAVAILABLE", "Midtrans status 429");
      },
    };
    expect(summarizeReconcile(await reconcilePayments(handle.db, flaky))).toEqual({ checked: 1, mismatches: 0, unchecked: 1, empty: false, exitCode: 1 });
    expect(await handle.db.execute(sql`select status from payment_transactions`)).toEqual([{ status: "WAITING_PAYMENT" }, { status: "WAITING_PAYMENT" }]);
  });
});

describe("admin CLI recovery (§8.1)", () => {
  it("resets a password by email, revokes sessions, audits as SYSTEM", async () => {
    const { id } = await createAdminAccount(handle.db, { name: "Owner", email: "owner@toko.test", password: "password-lama-12345" }, { type: "SYSTEM" });
    await handle.db.insert(adminSessions).values({ id: "s", token: "t", userId: id, expiresAt: new Date(Date.now() + 3600_000) });
    expect(await resetAdminPasswordByEmail(handle.db, { email: "OWNER@toko.test", raw: { password: "password-baru-67890", confirmPassword: "password-baru-67890" } })).toEqual({ ok: true });
    const [acct] = await handle.db.select().from(adminAccounts).where(eq(adminAccounts.userId, id));
    expect(await verifyPassword(acct!.password!, "password-baru-67890")).toBe(true);
    expect(await handle.db.select().from(adminSessions)).toHaveLength(0);
    expect((await handle.db.select().from(auditLogs).where(eq(auditLogs.eventType, "ADMIN_PASSWORD_RESET")))[0]).toMatchObject({ actorType: "SYSTEM" });
    expect(await resetAdminPasswordByEmail(handle.db, { email: "nobody@toko.test", raw: { password: "password-baru-67890", confirmPassword: "password-baru-67890" } })).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});
