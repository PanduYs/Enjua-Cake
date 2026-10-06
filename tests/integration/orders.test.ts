import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import { createFixedClock } from "@/server/clock";
import { createDatabase, type DatabaseHandle } from "@/server/db/client";
import { admins, auditLogs, categories, orderItems, orders, paymentTransactions, pickupDates, products, settings } from "@/server/db/schema";
import { ORDER_NUMBER_PATTERN } from "@/server/domain/orders/order-number";
import { parseIsoDate } from "@/server/domain/time/wib";
import { trackingTokenRef } from "@/server/security/tracking-token";
import { getAdminOrderDetail, listAdminOrders } from "@/server/services/admin-orders";
import { countActiveOrders } from "@/server/services/capacity";
import { expireDueReservations, expireIfDue, regenerateTrackingToken, transitionOrder } from "@/server/services/order-lifecycle";
import { PLACE_ORDER_RATE_LIMIT, placeOrder, type PlaceOrderDeps, type PlacedOrder } from "@/server/services/place-order";
import { getTrackingView, TRACKING_RATE_LIMITS, verifyTrackingAccess } from "@/server/services/tracking";

import { openProxiedDatabase } from "../support/wire-proxy";

let handle: DatabaseHandle;
const ids: Record<string, string> = {};
const START = new Date("2026-10-02T03:00:00Z"); // 10:00 WIB
const clock = createFixedClock(START);
const deps = (): PlaceOrderDeps => ({
  db: handle.db,
  clock,
  publicBucket: { publicUrl: (k: string) => `/storage/${k}` },
});
const ADMIN_ID = "admin-test-1";
const admin = { type: "ADMIN" as const, adminId: ADMIN_ID };

beforeAll(() => {
  // Large pool so concurrent placeOrder calls really hold transactions at the same time.
  handle = createDatabase(inject("databaseUrl"), {
    max: 25,
    silenceNotices: true,
  });
});
afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  clock.set(START);
  await handle.db.execute(
    sql`TRUNCATE orders, pickup_dates, product_images, products, categories, settings, rate_limits, audit_logs, admin_sessions, admin_accounts, admins RESTART IDENTITY CASCADE`,
  );
  await handle.db.insert(admins).values({ id: ADMIN_ID, name: "Admin Satu", email: "admin1@example.test" });
  const [cat] = await handle.db.insert(categories).values({ name: "Cakes", slug: "cakes" }).returning({ id: categories.id });
  const rows = await handle.db
    .insert(products)
    .values([
      {
        categoryId: cat!.id,
        name: "Brownies",
        slug: "brownies",
        price: 85_000,
        productType: "READY_STOCK",
      },
      {
        categoryId: cat!.id,
        name: "Cheesecake",
        slug: "cheesecake",
        price: 250_000,
        salePrice: 225_000,
        productType: "PRE_ORDER",
        minimumPreorderDays: 2,
      },
      {
        categoryId: cat!.id,
        name: "Pudding",
        slug: "pudding",
        price: 45_000,
        productType: "READY_STOCK",
        availability: "SOLD_OUT",
      },
    ])
    .returning({ id: products.id, slug: products.slug });
  for (const r of rows) ids[r.slug] = r.id;
});

const input = (over: Record<string, unknown> = {}) => ({
  items: [{ productId: ids.brownies, quantity: 2 }],
  customerName: "Sari",
  whatsapp: "0812 3456 7890",
  notes: "",
  pickupDate: "2026-10-02",
  paymentMethod: "CASH",
  paymentOption: "FULL",
  ...over,
});

async function place(over: Record<string, unknown> = {}, opts: { key?: string; ip?: string } = {}) {
  return placeOrder(deps(), input(over), {
    idempotencyKey: opts.key ?? randomUUID(),
    clientIp: opts.ip ?? `ip-${randomUUID()}`,
  });
}

async function placeOk(over: Record<string, unknown> = {}): Promise<PlacedOrder> {
  const r = await place(over);
  if (!r.ok) throw new Error(`placeOrder failed: ${JSON.stringify(r)}`);
  return r.order;
}

const qrisPreorder = () => ({
  items: [{ productId: ids.cheesecake, quantity: 1 }],
  paymentMethod: "QRIS",
  paymentOption: "DP_50",
  pickupDate: "2026-10-05",
});

async function orderRow(id: string) {
  const [row] = await handle.db.select().from(orders).where(eq(orders.id, id));
  return row!;
}

describe("placeOrder (IMPLEMENTATION-PLAN §11.1)", () => {
  it("QRIS DP: snapshots, DP transaction, reservation from settings, audit, hashed token", async () => {
    await handle.db.insert(settings).values({ key: "qris_reservation_minutes", value: 45 });
    const o = await placeOk({
      ...qrisPreorder(),
      items: [{ productId: ids.cheesecake, quantity: 2 }],
    });

    expect(o.orderNumber).toMatch(ORDER_NUMBER_PATTERN);
    expect(o.orderNumber.startsWith("ENC-20261002-")).toBe(true);
    expect(o.trackingToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(o.payment).toEqual({
      total: 450_000,
      dpAmount: 225_000,
      dueNow: 225_000,
      remaining: 225_000,
    });
    expect(o.reservationExpiresAt).toBe(new Date(START.getTime() + 45 * 60_000).toISOString());

    const row = await orderRow(o.orderId);
    expect(row).toMatchObject({
      orderStatus: "NEW",
      paymentStatus: "WAITING_PAYMENT",
      source: "WEBSITE",
      customerPhone: "+6281234567890",
      subtotal: 500_000,
      discountTotal: 50_000,
      grandTotal: 450_000,
      dpAmount: 225_000,
      paidAmount: 0,
      remainingAmount: 450_000,
      orderDateEffective: "2026-10-02",
    });
    expect(row.trackingTokenHash).not.toContain(o.trackingToken!);

    const items = await handle.db.select().from(orderItems).where(eq(orderItems.orderId, o.orderId));
    expect(items).toEqual([
      expect.objectContaining({
        productNameSnapshot: "Cheesecake",
        productTypeSnapshot: "PRE_ORDER",
        minimumPreorderDaysSnapshot: 2,
        unitPriceSnapshot: 250_000,
        salePriceSnapshot: 225_000,
        effectiveUnitPrice: 225_000,
        quantity: 2,
        lineSubtotal: 450_000,
      }),
    ]);

    // Snapshot survives later product edits (FD-40).
    await handle.db.update(products).set({ price: 999_000, name: "Renamed" }).where(eq(products.id, ids.cheesecake!));
    const view = await getTrackingView(handle.db, { orderId: o.orderId, tokenRef: trackingTokenRef(row.trackingTokenHash) }, clock);
    // Prices shown on tracking are the snapshots (normal 250.000, paid 225.000), not the edited product.
    expect(view?.items).toEqual([{ name: "Cheesecake", quantity: 2, unitPrice: 250_000, effectiveUnitPrice: 225_000, lineSubtotal: 450_000 }]);
    // Subtotal at normal price − discount = total paid; the line amount already includes the discount.
    expect(view).toMatchObject({ subtotal: 500_000, discountTotal: 50_000, grandTotal: 450_000 });
    expect(view!.subtotal - view!.discountTotal).toBe(view!.grandTotal);
    expect(view!.items.reduce((sum, i) => sum + i.lineSubtotal, 0)).toBe(view!.grandTotal);

    const txs = await handle.db.select().from(paymentTransactions).where(eq(paymentTransactions.orderId, o.orderId));
    expect(txs).toEqual([
      expect.objectContaining({
        purpose: "DP",
        method: "QRIS",
        amount: 225_000,
        status: "WAITING_PAYMENT",
        expiresAt: row.reservationExpiresAt,
      }),
    ]);

    const audit = await handle.db.select().from(auditLogs).where(eq(auditLogs.entityId, o.orderId));
    expect(audit.map((a) => [a.eventType, a.actorType])).toEqual([["ORDER_CREATED", "SYSTEM"]]);
  });

  it("Bank Transfer FULL uses the transfer reservation duration", async () => {
    const o = await placeOk({ paymentMethod: "BANK_TRANSFER" });
    expect(o.reservationExpiresAt).toBe(new Date(START.getTime() + 120 * 60_000).toISOString());
    const txs = await handle.db.select().from(paymentTransactions).where(eq(paymentTransactions.orderId, o.orderId));
    expect(txs).toEqual([
      expect.objectContaining({
        purpose: "FULL",
        method: "BANK_TRANSFER",
        amount: 170_000,
      }),
    ]);
  });

  it("Cash: UNPAID, no reservation expiry, no payment transaction (FD-15, FD-57)", async () => {
    const o = await placeOk();
    expect(o.reservationExpiresAt).toBeNull();
    expect(await orderRow(o.orderId)).toMatchObject({
      paymentStatus: "UNPAID",
      reservationExpiresAt: null,
      dpAmount: null,
    });
    expect(await handle.db.select().from(paymentTransactions).where(eq(paymentTransactions.orderId, o.orderId))).toHaveLength(0);
  });

  it("rejects what the UI would block: Cash + Pre-Order, Sold Out, blocked/full date, cutoff", async () => {
    expect(
      await place({
        ...qrisPreorder(),
        paymentMethod: "CASH",
        paymentOption: "FULL",
      }),
    ).toMatchObject({
      ok: false,
      code: "CHECKOUT_INVALID",
      fieldErrors: { paymentMethod: expect.any(String) },
    });
    expect(await place({ items: [{ productId: ids.pudding, quantity: 1 }] })).toMatchObject({
      ok: false,
      code: "CHECKOUT_INVALID",
      cartIssues: [{ issue: "SOLD_OUT" }],
    });

    await handle.db.insert(pickupDates).values([
      { date: "2026-10-03", isBlocked: true },
      { date: "2026-10-04", capacityOverride: 0 },
    ]);
    expect(await place({ pickupDate: "2026-10-03" })).toMatchObject({
      ok: false,
      pickupReason: "BLOCKED",
    });
    expect(await place({ pickupDate: "2026-10-04" })).toMatchObject({
      ok: false,
      pickupReason: "FULL",
    });

    clock.set(new Date("2026-10-02T08:30:00Z")); // 15:30 WIB
    expect(await place()).toMatchObject({
      ok: false,
      pickupReason: "CUTOFF_PASSED",
    });
    expect(await handle.db.select().from(orders)).toHaveLength(0);
  });

  it("rejects a missing/invalid idempotency key and rate-limits per IP", async () => {
    expect(
      await placeOrder(deps(), input(), {
        idempotencyKey: "nope",
        clientIp: "x",
      }),
    ).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    for (let i = 0; i < PLACE_ORDER_RATE_LIMIT.limit; i++) await place({ customerName: "" }, { ip: "same-ip" });
    expect(await place({}, { ip: "same-ip" })).toEqual({
      ok: false,
      code: "RATE_LIMITED",
    });
  });
});

describe("placeOrder round trips", () => {
  it("reads the settings once and uses that snapshot for validation and the order", async () => {
    await handle.db.insert(settings).values({ key: "qris_reservation_minutes", value: 45 });
    const { handle: proxied, proxy } = await openProxiedDatabase(inject("databaseUrl"), 2);
    try {
      const r = await placeOrder({ ...deps(), db: proxied.db }, input(qrisPreorder()), { idempotencyKey: randomUUID(), clientIp: `ip-${randomUUID()}` });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.order.reservationExpiresAt).toBe(new Date(clock.now().getTime() + 45 * 60_000).toISOString());
      expect(proxy.takeStatements().filter((s) => /from "settings"/.test(s))).toHaveLength(1);
    } finally {
      await proxied.close();
      await proxy.close();
    }
  });
});

describe("placeOrder concurrency — real order creation (FD-05, EC-01)", () => {
  it("20 concurrent placeOrder calls for the last slot → exactly one order", async () => {
    // capacity 3 with 2 already taken → one slot left. Row exists beforehand so the
    // per-date row lock, not the upsert, is what serializes the race.
    await handle.db.insert(pickupDates).values({ date: "2026-10-05", capacityOverride: 3 });
    await placeOk({ pickupDate: "2026-10-05" });
    await placeOk({ pickupDate: "2026-10-05", paymentMethod: "QRIS" });

    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => place({ pickupDate: "2026-10-05", customerName: `Racer ${i}` })));
    const winners = results.filter((r) => r.ok);
    expect(winners).toHaveLength(1);
    for (const r of results.filter((r) => !r.ok))
      expect(r).toMatchObject({
        ok: false,
        code: "CHECKOUT_INVALID",
        pickupReason: "FULL",
      });

    const rows = await handle.db.select().from(orders).where(eq(orders.pickupDate, "2026-10-05"));
    expect(rows).toHaveLength(3);
    expect((await countActiveOrders(handle.db, [parseIsoDate("2026-10-05")], START)).get(parseIsoDate("2026-10-05"))).toBe(3);
  });

  it("never exceeds capacity across mixed methods (capacity 4, 30 concurrent)", async () => {
    await handle.db.insert(pickupDates).values({ date: "2026-10-06", capacityOverride: 4 });
    const methods = ["CASH", "QRIS", "BANK_TRANSFER"] as const;
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) => place({ pickupDate: "2026-10-06", paymentMethod: methods[i % 3] })));
    expect(results.filter((r) => r.ok)).toHaveLength(4);
    expect(await handle.db.select().from(orders).where(eq(orders.pickupDate, "2026-10-06"))).toHaveLength(4);
  });

  it("same idempotency key: sequential and concurrent submits create one order; replays carry no token (TD-15)", async () => {
    const key = randomUUID();
    const first = await place({}, { key });
    const again = await place({}, { key });
    expect(first.ok && again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    expect(again.order).toMatchObject({
      orderId: first.order.orderId,
      duplicate: true,
      trackingToken: null,
    });

    const key2 = randomUUID();
    const burst = await Promise.all(Array.from({ length: 10 }, () => place({ pickupDate: "2026-10-03" }, { key: key2 })));
    const okOnes = burst.filter((r) => r.ok);
    expect(okOnes).toHaveLength(10);
    expect(new Set(okOnes.map((r) => r.ok && r.order.orderId)).size).toBe(1);
    expect(okOnes.filter((r) => r.ok && r.order.trackingToken !== null)).toHaveLength(1);
    expect(await handle.db.select().from(orders).where(eq(orders.idempotencyKey, key2))).toHaveLength(1);
  });
});

describe("reservation expiry (TD-07, FD-14, FD-56, FD-120)", () => {
  it("expires only after the deadline; frees the slot; idempotent", async () => {
    await handle.db.insert(pickupDates).values({ date: "2026-10-05", capacityOverride: 1 });
    const o = await placeOk({ ...qrisPreorder() });

    clock.set(new Date(START.getTime() + 29 * 60_000));
    expect(await expireIfDue(handle.db, o.orderId, clock)).toBe(false);
    expect(await place({ ...qrisPreorder() })).toMatchObject({
      ok: false,
      pickupReason: "FULL",
    });

    clock.set(new Date(START.getTime() + 30 * 60_000));
    expect(await expireIfDue(handle.db, o.orderId, clock)).toBe(true);
    expect(await expireIfDue(handle.db, o.orderId, clock)).toBe(false);
    expect(await orderRow(o.orderId)).toMatchObject({
      orderStatus: "CANCELLED",
      paymentStatus: "EXPIRED",
      cancellationReason: "PAYMENT_EXPIRED",
      cancelledByType: "SYSTEM",
    });
    const [tx] = await handle.db.select().from(paymentTransactions).where(eq(paymentTransactions.orderId, o.orderId));
    expect(tx?.status).toBe("EXPIRED");

    // Slot released → a new order can take it.
    expect((await place({ ...qrisPreorder() })).ok).toBe(true);
  });

  it("an expired-but-unswept reservation does not block a new order (lazy expiry)", async () => {
    await handle.db.insert(pickupDates).values({ date: "2026-10-05", capacityOverride: 1 });
    await placeOk({ ...qrisPreorder() });
    clock.set(new Date(START.getTime() + 31 * 60_000));
    expect((await place({ ...qrisPreorder() })).ok).toBe(true);
  });

  it("does not expire Cash, waiting-verification, or partially paid orders", async () => {
    const cash = await placeOk();
    const verifying = await placeOk({ paymentMethod: "BANK_TRANSFER" });
    const paid = await placeOk({ ...qrisPreorder() });
    await handle.db.update(orders).set({ paymentStatus: "WAITING_VERIFICATION" }).where(eq(orders.id, verifying.orderId));
    await handle.db
      .update(orders)
      .set({
        paymentStatus: "PARTIALLY_PAID",
        paidAmount: 112_500,
        remainingAmount: 112_500,
      })
      .where(eq(orders.id, paid.orderId));

    clock.set(new Date(START.getTime() + 24 * 60 * 60_000));
    for (const o of [cash, verifying, paid]) expect(await expireIfDue(handle.db, o.orderId, clock)).toBe(false);
    expect(await expireDueReservations(handle.db, clock)).toEqual({
      ordersExpired: 0,
      remainingPaymentsExpired: 0,
    });
  });

  it("sweeper expires due orders and stale DP-balance transactions without cancelling the order (TD-09)", async () => {
    const a = await placeOk({ ...qrisPreorder() });
    const b = await placeOk({ paymentMethod: "BANK_TRANSFER" });
    const dp = await placeOk({ ...qrisPreorder(), pickupDate: "2026-10-06" });
    await handle.db
      .update(orders)
      .set({
        paymentStatus: "PARTIALLY_PAID",
        paidAmount: 112_500,
        remainingAmount: 112_500,
      })
      .where(eq(orders.id, dp.orderId));
    await handle.db.insert(paymentTransactions).values({
      orderId: dp.orderId,
      purpose: "REMAINING",
      method: "QRIS",
      amount: 112_500,
      status: "WAITING_PAYMENT",
      expiresAt: new Date(START.getTime() + 10 * 60_000),
    });

    clock.set(new Date(START.getTime() + 60 * 60_000)); // QRIS (30m) due, transfer (120m) not yet
    expect(await expireDueReservations(handle.db, clock)).toEqual({
      ordersExpired: 1,
      remainingPaymentsExpired: 1,
    });
    expect((await orderRow(a.orderId)).orderStatus).toBe("CANCELLED");
    expect((await orderRow(b.orderId)).orderStatus).toBe("NEW");
    expect((await orderRow(dp.orderId)).orderStatus).toBe("NEW");
    const remaining = await handle.db
      .select()
      .from(paymentTransactions)
      .where(and(eq(paymentTransactions.orderId, dp.orderId), eq(paymentTransactions.purpose, "REMAINING")));
    expect(remaining[0]?.status).toBe("EXPIRED");
  });
});

describe("transitionOrder (TD-14, §19)", () => {
  it("walks Cash through the lifecycle; Selesai requires Lunas", async () => {
    const o = await placeOk();
    expect(
      await transitionOrder(
        handle.db,
        {
          orderId: o.orderId,
          to: "CONFIRMED",
          actor: admin,
          expectedFrom: "NEW",
        },
        clock,
      ),
    ).toEqual({ ok: true, from: "NEW", to: "CONFIRMED" });
    expect((await transitionOrder(handle.db, { orderId: o.orderId, to: "PROCESSING", actor: admin }, clock)).ok).toBe(true);
    expect((await transitionOrder(handle.db, { orderId: o.orderId, to: "READY_FOR_PICKUP", actor: admin }, clock)).ok).toBe(true);
    expect(await transitionOrder(handle.db, { orderId: o.orderId, to: "COMPLETED", actor: admin }, clock)).toEqual({
      ok: false,
      error: "PAYMENT_NOT_COMPLETE",
    });

    const detail = await getAdminOrderDetail(handle.db, o.orderId, clock);
    expect(detail?.allowed).toEqual(["CANCELLED"]);
    expect(detail?.blocked).toEqual(["COMPLETED"]);

    await handle.db.update(orders).set({ paymentStatus: "PAID", paidAmount: 170_000, remainingAmount: 0 }).where(eq(orders.id, o.orderId));
    expect((await transitionOrder(handle.db, { orderId: o.orderId, to: "COMPLETED", actor: admin }, clock)).ok).toBe(true);
    expect(await transitionOrder(handle.db, { orderId: o.orderId, to: "CANCELLED", actor: admin, reason: "x" }, clock)).toEqual({
      ok: false,
      error: "INVALID_TRANSITION",
    });

    const events = await handle.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, o.orderId), eq(auditLogs.eventType, "ORDER_STATUS_CHANGED")));
    expect(events).toHaveLength(4);
    expect(events.every((e) => e.actorAdminId === ADMIN_ID)).toBe(true);
  });

  it("rejects stale status, unpaid QRIS confirmation, skipping steps, and unknown orders", async () => {
    const o = await placeOk({ ...qrisPreorder() });
    expect(
      await transitionOrder(
        handle.db,
        {
          orderId: o.orderId,
          to: "CONFIRMED",
          actor: admin,
          expectedFrom: "NEW",
        },
        clock,
      ),
    ).toMatchObject({ ok: false });
    expect(await transitionOrder(handle.db, { orderId: o.orderId, to: "PROCESSING", actor: admin }, clock)).toEqual({ ok: false, error: "INVALID_TRANSITION" });
    expect(
      await transitionOrder(
        handle.db,
        {
          orderId: o.orderId,
          to: "CANCELLED",
          actor: admin,
          reason: "x",
          expectedFrom: "CONFIRMED",
        },
        clock,
      ),
    ).toEqual({ ok: false, error: "STALE_STATUS" });
    expect(await transitionOrder(handle.db, { orderId: randomUUID(), to: "CANCELLED", actor: admin, reason: "x" }, clock)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });

  it("admin cancel needs a reason, voids pending payment, frees the slot, and is final", async () => {
    await handle.db.insert(pickupDates).values({ date: "2026-10-05", capacityOverride: 1 });
    const o = await placeOk({ ...qrisPreorder() });
    expect(await transitionOrder(handle.db, { orderId: o.orderId, to: "CANCELLED", actor: admin, reason: "   " }, clock)).toEqual({
      ok: false,
      error: "REASON_REQUIRED",
    });
    expect(
      (
        await transitionOrder(
          handle.db,
          {
            orderId: o.orderId,
            to: "CANCELLED",
            actor: admin,
            reason: "Permintaan customer",
          },
          clock,
        )
      ).ok,
    ).toBe(true);

    expect(await orderRow(o.orderId)).toMatchObject({
      orderStatus: "CANCELLED",
      cancellationReason: "Permintaan customer",
      cancelledByType: "ADMIN",
      cancelledByAdminId: ADMIN_ID,
    });
    const [tx] = await handle.db.select().from(paymentTransactions).where(eq(paymentTransactions.orderId, o.orderId));
    expect(tx?.status).toBe("VOIDED");
    expect(await transitionOrder(handle.db, { orderId: o.orderId, to: "NEW", actor: admin }, clock)).toMatchObject({ ok: false });
    expect((await place({ ...qrisPreorder() })).ok).toBe(true);

    const [{ tokenHash }] = [{ tokenHash: (await orderRow(o.orderId)).trackingTokenHash }];
    const view = await getTrackingView(handle.db, { orderId: o.orderId, tokenRef: trackingTokenRef(tokenHash) }, clock);
    expect(view?.cancellation).toBe("ADMIN");
    expect(JSON.stringify(view)).not.toContain("Permintaan customer");
  });

  it("concurrent admin transitions with the same expected status → one wins", async () => {
    const o = await placeOk();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        transitionOrder(
          handle.db,
          {
            orderId: o.orderId,
            to: "CONFIRMED",
            actor: admin,
            expectedFrom: "NEW",
          },
          clock,
        ),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.error === "STALE_STATUS")).toBe(true);
  });

  it("admin list sweeps expired reservations and filters by status/date", async () => {
    await placeOk({ ...qrisPreorder() });
    await placeOk({ pickupDate: "2026-10-03" });
    clock.set(new Date(START.getTime() + 31 * 60_000));
    expect((await listAdminOrders(handle.db, clock, { status: "CANCELLED" })).map((r) => r.pickupDate)).toEqual(["2026-10-05"]);
    expect(await listAdminOrders(handle.db, clock, { pickupDate: "2026-10-03" })).toHaveLength(1);
    expect(await listAdminOrders(handle.db, clock)).toHaveLength(2);
  });
});

describe("tracking access (FD-66–FD-69, EC-11)", () => {
  it("accepts number + token (normalized), rejects everything else generically", async () => {
    const o = await placeOk();
    const ok = await verifyTrackingAccess(
      { db: handle.db, clock },
      {
        orderNumber: o.orderNumber.toLowerCase(),
        token: ` ${o.trackingToken} `,
      },
      "ip1",
    );
    expect(ok).toMatchObject({ ok: true, orderId: o.orderId });

    const wrongToken = await verifyTrackingAccess({ db: handle.db, clock }, { orderNumber: o.orderNumber, token: "x".repeat(43) }, "ip1");
    const unknownOrder = await verifyTrackingAccess({ db: handle.db, clock }, { orderNumber: "ENC-20261002-ZZZZ", token: o.trackingToken }, "ip1");
    const numberOnly = await verifyTrackingAccess({ db: handle.db, clock }, { orderNumber: o.orderNumber, token: "" }, "ip1");
    const garbage = await verifyTrackingAccess({ db: handle.db, clock }, { nope: true }, "ip1");
    for (const r of [wrongToken, unknownOrder, numberOnly, garbage]) expect(r).toEqual({ ok: false, code: "INVALID" });
  });

  it("view hides phone and admin notes; shows deadline only while NEW", async () => {
    const o = await placeOk({ paymentMethod: "QRIS", notes: "rahasia" });
    const row = await orderRow(o.orderId);
    const view = await getTrackingView(handle.db, { orderId: o.orderId, tokenRef: trackingTokenRef(row.trackingTokenHash) }, clock);
    expect(view).toMatchObject({
      orderNumber: o.orderNumber,
      orderStatus: "NEW",
      reservationExpiresAt: o.reservationExpiresAt,
      cancellation: null,
    });
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("6281234567890");
    expect(serialized).not.toContain("rahasia");
    expect(serialized).not.toContain(row.trackingTokenHash);

    clock.set(new Date(START.getTime() + 31 * 60_000)); // lazily expired on view
    const expired = await getTrackingView(handle.db, { orderId: o.orderId, tokenRef: trackingTokenRef(row.trackingTokenHash) }, clock);
    expect(expired).toMatchObject({
      orderStatus: "CANCELLED",
      cancellation: "PAYMENT_EXPIRED",
      reservationExpiresAt: null,
    });
  });

  it("rate-limits guessing per order number across IPs", async () => {
    const o = await placeOk();
    for (let i = 0; i < TRACKING_RATE_LIMITS.perOrder.limit; i++) {
      await verifyTrackingAccess({ db: handle.db, clock }, { orderNumber: o.orderNumber, token: `guess-${i}` }, `ip-${i}`);
    }
    expect(await verifyTrackingAccess({ db: handle.db, clock }, { orderNumber: o.orderNumber, token: o.trackingToken }, "fresh-ip")).toEqual({
      ok: false,
      code: "RATE_LIMITED",
    });
  });

  it("regenerating the access code invalidates the old code and old sessions (FD-72, DI-05)", async () => {
    const o = await placeOk();
    const oldRef = trackingTokenRef((await orderRow(o.orderId)).trackingTokenHash);
    const fresh = await regenerateTrackingToken(handle.db, o.orderId, ADMIN_ID);
    expect(fresh).toMatch(/^[A-Za-z0-9_-]{43}$/);

    expect(await verifyTrackingAccess({ db: handle.db, clock }, { orderNumber: o.orderNumber, token: o.trackingToken }, "a")).toEqual({
      ok: false,
      code: "INVALID",
    });
    const ok = await verifyTrackingAccess({ db: handle.db, clock }, { orderNumber: o.orderNumber, token: fresh }, "a");
    expect(ok.ok).toBe(true);
    expect(await getTrackingView(handle.db, { orderId: o.orderId, tokenRef: oldRef }, clock)).toBeNull();
    if (ok.ok) expect(await getTrackingView(handle.db, { orderId: o.orderId, tokenRef: trackingTokenRef(ok.tokenHash) }, clock)).not.toBeNull();

    const audit = await handle.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, o.orderId), eq(auditLogs.eventType, "TRACKING_TOKEN_REGENERATED")));
    expect(audit).toEqual([expect.objectContaining({ actorAdminId: ADMIN_ID })]);
    expect(JSON.stringify(audit)).not.toContain(fresh!);
    expect(await regenerateTrackingToken(handle.db, randomUUID(), ADMIN_ID)).toBeNull();
  });
});
