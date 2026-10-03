import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import { createFixedClock } from "@/server/clock";
import { createDatabase, type DatabaseHandle } from "@/server/db/client";
import { categories, paymentTransactions, products, settings } from "@/server/db/schema";
import { MockPaymentProvider } from "@/server/payments/mock-provider";
import { getCustomerPaymentState, requestQrisPayment } from "@/server/services/payments";
import { placeOrder, type PlacedOrder } from "@/server/services/place-order";

/**
 * What the customer is shown to pay (PRD §12.2, §16, §19; IMPLEMENTATION-PLAN §14):
 * QRIS → a QR for exactly the amount due, valid until the reservation minus the
 * buffer; Bank Transfer → amount, deadline, and the accounts/instructions from
 * Website Settings (empty until the merchant fills them in — FD-88).
 */
let handle: DatabaseHandle;
let productId = "";
const START = new Date("2026-10-02T03:00:00Z"); // 10:00 WIB
const clock = createFixedClock(START);
let provider: MockPaymentProvider;
const deps = () => ({ db: handle.db, clock, provider });
const minutes = (n: number) => new Date(START.getTime() + n * 60_000);

beforeAll(() => {
  handle = createDatabase(inject("databaseUrl"), { max: 10, silenceNotices: true });
});
afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  clock.set(START);
  provider = new MockPaymentProvider({ webhookSecret: "payment-display-secret", now: () => clock.now() });
  await handle.db.execute(sql`TRUNCATE orders, pickup_dates, product_images, products, categories, settings, rate_limits, audit_logs RESTART IDENTITY CASCADE`);
  const [cat] = await handle.db.insert(categories).values({ name: "Cakes", slug: "cakes" }).returning({ id: categories.id });
  const [p] = await handle.db
    .insert(products)
    .values({ categoryId: cat!.id, name: "Odd", slug: "odd", price: 125_555, productType: "READY_STOCK" })
    .returning({ id: products.id });
  productId = p!.id;
});

async function order(paymentMethod: "QRIS" | "BANK_TRANSFER", paymentOption: "FULL" | "DP_50"): Promise<PlacedOrder> {
  const r = await placeOrder(
    { db: handle.db, clock, publicBucket: { publicUrl: (k) => k } },
    { items: [{ productId, quantity: 1 }], customerName: "Sari", whatsapp: "081234567890", notes: "", pickupDate: "2026-10-05", paymentMethod, paymentOption },
    { idempotencyKey: randomUUID(), clientIp: randomUUID() },
  );
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.order;
}

// Rp125.555: DP = ceil(62.777,5) = Rp62.778 (FD-44).
const cases = [
  { method: "QRIS", option: "FULL", due: 125_555, purpose: "FULL" },
  { method: "QRIS", option: "DP_50", due: 62_778, purpose: "DP" },
  { method: "BANK_TRANSFER", option: "FULL", due: 125_555, purpose: "FULL" },
  { method: "BANK_TRANSFER", option: "DP_50", due: 62_778, purpose: "DP" },
] as const;

describe("customer payment information after checkout", () => {
  for (const c of cases.filter((c) => c.method === "QRIS")) {
    it(`QRIS ${c.option}: a QR for exactly ${c.due}, valid until reservation − 2 min buffer, re-used on reload`, async () => {
      const o = await order(c.method, c.option);
      const before = await getCustomerPaymentState(handle.db, o.orderId, clock);
      expect(before).toMatchObject({ method: "QRIS", stage: "PAY_INITIAL", amountDue: c.due, deadline: o.reservationExpiresAt, activeQris: null });

      const r = await requestQrisPayment(deps(), o.orderId);
      if (!r.ok) throw new Error(r.error);
      expect(r.qris).toMatchObject({ amount: c.due, purpose: c.purpose, expiresAt: minutes(28).toISOString() });
      expect(r.qris.qrString).toMatch(new RegExp(`^MOCKQRIS\\|MOCK-[0-9a-f-]{36}\\|${c.due}$`));

      const after = await getCustomerPaymentState(handle.db, o.orderId, clock);
      expect(after?.activeQris).toEqual(r.qris);
      const again = await requestQrisPayment(deps(), o.orderId);
      expect(again).toEqual(r);
      expect(await handle.db.select().from(paymentTransactions).where(eq(paymentTransactions.orderId, o.orderId))).toHaveLength(1);
    });
  }

  for (const c of cases.filter((c) => c.method === "BANK_TRANSFER")) {
    it(`Bank Transfer ${c.option}: ${c.due} due by the 2-hour deadline, accounts and instructions come from Website Settings`, async () => {
      const o = await order(c.method, c.option);
      const empty = await getCustomerPaymentState(handle.db, o.orderId, clock);
      expect(empty).toMatchObject({
        method: "BANK_TRANSFER",
        stage: "PAY_INITIAL",
        amountDue: c.due,
        pendingTransfer: { amount: c.due, purpose: c.purpose, expiresAt: minutes(120).toISOString() },
        bankAccounts: [],
        paymentInstructions: null,
        activeQris: null,
      });

      const accounts = [{ bankName: "Bank Contoh", accountNumber: "0000000000", accountHolder: "Contoh Pemilik" }];
      await handle.db.insert(settings).values([
        { key: "bank_accounts", value: accounts },
        { key: "payment_instructions", value: "Cantumkan nomor pesanan pada berita transfer." },
      ]);
      expect(await getCustomerPaymentState(handle.db, o.orderId, clock)).toMatchObject({
        bankAccounts: accounts,
        paymentInstructions: "Cantumkan nomor pesanan pada berita transfer.",
      });
    });
  }

  it("a QR cannot be requested for a Bank Transfer order (crafted request), and nothing is created", async () => {
    const o = await order("BANK_TRANSFER", "FULL");
    expect(await requestQrisPayment(deps(), o.orderId)).toEqual({ ok: false, error: "METHOD_NOT_AVAILABLE" });
    const rows = await handle.db.select().from(paymentTransactions).where(eq(paymentTransactions.orderId, o.orderId));
    expect(rows.map((t) => [t.method, t.providerReference])).toEqual([["BANK_TRANSFER", null]]);
  });

  it("expiry: no QR inside the buffer; after the reservation the order is closed and shows no payment action", async () => {
    const qris = await order("QRIS", "DP_50");
    const transfer = await order("BANK_TRANSFER", "DP_50");

    clock.set(minutes(28)); // QR would expire at the same instant: refused
    expect(await requestQrisPayment(deps(), qris.orderId)).toEqual({ ok: false, error: "RESERVATION_EXPIRED" });

    clock.set(minutes(30));
    expect(await requestQrisPayment(deps(), qris.orderId)).toEqual({ ok: false, error: "ORDER_CLOSED" });
    expect(await getCustomerPaymentState(handle.db, qris.orderId, clock)).toMatchObject({ stage: "CLOSED", activeQris: null });

    clock.set(minutes(119));
    expect(await getCustomerPaymentState(handle.db, transfer.orderId, clock)).toMatchObject({ stage: "PAY_INITIAL", pendingTransfer: { amount: 62_778 } });
    clock.set(minutes(121));
    expect(await requestQrisPayment(deps(), transfer.orderId)).toMatchObject({ ok: false });
    expect(await getCustomerPaymentState(handle.db, transfer.orderId, clock)).toMatchObject({ stage: "CLOSED" });
  });
});
