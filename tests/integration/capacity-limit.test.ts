import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import { createFixedClock } from "@/server/clock";
import { createDatabase, type DatabaseHandle } from "@/server/db/client";
import { admins, categories, orders, pickupDates, products } from "@/server/db/schema";
import { parseIsoDate } from "@/server/domain/time/wib";
import { countActiveOrders } from "@/server/services/capacity";
import { getPickupAvailability } from "@/server/services/checkout";
import { placeManualOrder } from "@/server/services/manual-order";
import { expireDueReservations, transitionOrder } from "@/server/services/order-lifecycle";
import { placeOrder, type PlaceOrderDeps, type PlaceOrderResult } from "@/server/services/place-order";

/**
 * Daily pickup capacity (FD-02, FD-03, FD-05, FD-07, FD-14, FD-119; PRD §9). Uses the
 * real default — no settings row and no per-date override — so "10" comes from the
 * same place it does for customers. Website and Manual Order share the date lock.
 */
let handle: DatabaseHandle;
let productId = "";
const ADMIN_ID = "admin-capacity";
const DATE = "2026-10-05";
const START = new Date("2026-10-02T03:00:00Z"); // 10:00 WIB
const clock = createFixedClock(START);
const deps = (): PlaceOrderDeps => ({ db: handle.db, clock, publicBucket: { publicUrl: (k: string) => `/storage/${k}` } });

beforeAll(() => {
  handle = createDatabase(inject("databaseUrl"), { max: 25, silenceNotices: true });
});
afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  clock.set(START);
  await handle.db.execute(
    sql`TRUNCATE orders, pickup_dates, product_images, products, categories, settings, rate_limits, audit_logs, admin_sessions, admin_accounts, admins RESTART IDENTITY CASCADE`,
  );
  await handle.db.insert(admins).values({ id: ADMIN_ID, name: "Admin", email: "capacity-admin@example.test" });
  const [cat] = await handle.db.insert(categories).values({ name: "Cakes", slug: "cakes" }).returning({ id: categories.id });
  const [p] = await handle.db
    .insert(products)
    .values({ categoryId: cat!.id, name: "Brownies", slug: "brownies", price: 85_000, productType: "READY_STOCK" })
    .returning({ id: products.id });
  productId = p!.id;
});

const input = (over: Record<string, unknown> = {}) => ({
  items: [{ productId, quantity: 1 }],
  customerName: "Sari",
  whatsapp: "0812 3456 7890",
  notes: "",
  pickupDate: DATE,
  paymentMethod: "CASH",
  paymentOption: "FULL",
  ...over,
});
const website = (over: Record<string, unknown> = {}) => placeOrder(deps(), input(over), { idempotencyKey: randomUUID(), clientIp: `ip-${randomUUID()}` });
const manual = (over: Record<string, unknown> = {}, overrides: unknown = []) =>
  placeManualOrder(deps(), input(over), { adminId: ADMIN_ID, idempotencyKey: randomUUID(), overrides });

async function fill(n: number, over: Record<string, unknown> = {}) {
  const placed: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = await website({ customerName: `Pelanggan ${i + 1}`, ...over });
    if (!r.ok) throw new Error(`order ${i + 1} failed: ${JSON.stringify(r)}`);
    placed.push(r.order.orderId);
  }
  return placed;
}
const used = async () => (await countActiveOrders(handle.db, [parseIsoDate(DATE)], clock.now())).get(DATE) ?? 0;
const ordersOnDate = async () => (await handle.db.select({ id: orders.id }).from(orders).where(eq(orders.pickupDate, DATE))).length;
const expectFull = (r: PlaceOrderResult) => expect(r).toMatchObject({ ok: false, code: "CHECKOUT_INVALID", pickupReason: "FULL" });
async function dateStatus() {
  const a = await getPickupAvailability(deps(), [{ productId, quantity: 1 }]);
  return a.dates.find((d) => d.date === DATE)!;
}

describe("A. default capacity is 10 orders per pickup date", () => {
  it("10 active orders → the 11th website order is rejected and the date shows Penuh", async () => {
    expect(await dateStatus()).toMatchObject({ available: true, remaining: 10 });
    await fill(10);
    expect(await used()).toBe(10);
    expect(await dateStatus()).toMatchObject({ available: false, reason: "FULL" });
    expectFull(await website({ customerName: "Ke-11" }));
    expect(await ordersOnDate()).toBe(10);
  });

  it("every payment method occupies a slot while active (Cash, pending QRIS/transfer)", async () => {
    await fill(4, { paymentMethod: "CASH" });
    await fill(3, { paymentMethod: "QRIS" });
    await fill(3, { paymentMethod: "BANK_TRANSFER", paymentOption: "DP_50" });
    expectFull(await website({ paymentMethod: "QRIS" }));
    expect(await ordersOnDate()).toBe(10);
  });

  it("the quantity of items does not change the count: 1 order = 1 slot", async () => {
    await fill(9, { items: [{ productId, quantity: 50 }] });
    expect(await used()).toBe(9);
    expect((await website()).ok).toBe(true);
    expectFull(await website());
  });

  it("capacity is per date: a full date does not affect the next one", async () => {
    await fill(10);
    expect((await website({ pickupDate: "2026-10-06" })).ok).toBe(true);
  });
});

describe("B. last slot under concurrency", () => {
  it("9 active + 2 concurrent website checkouts → exactly one gets slot 10", async () => {
    await fill(9);
    const results = await Promise.all([website({ customerName: "A" }), website({ customerName: "B", paymentMethod: "QRIS" })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expectFull(results.find((r) => !r.ok)!);
    expect(await ordersOnDate()).toBe(10);
  });

  it("9 active + 20 concurrent (website and Manual Order without override) → exactly one more", async () => {
    await fill(9);
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? website({ customerName: `W${i}` }) : manual({ customerName: `M${i}` }))));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await ordersOnDate()).toBe(10);
    expect(await used()).toBe(10);
  });

  it("first order on a date that has no pickup_dates row yet: 12 concurrent → never more than 10", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => website({ customerName: `R${i}` })));
    expect(results.filter((r) => r.ok)).toHaveLength(10);
    expect(await ordersOnDate()).toBe(10);
  });
});

describe("C. cancellation frees the slot", () => {
  it("10 active, admin cancels one → 1 slot again, the next order succeeds, then full again", async () => {
    const ids = await fill(10);
    const cancelled = await transitionOrder(handle.db, { orderId: ids[0]!, to: "CANCELLED", actor: { type: "ADMIN", adminId: ADMIN_ID }, reason: "Pelanggan membatalkan" }, clock);
    expect(cancelled.ok).toBe(true);
    expect(await used()).toBe(9);
    expect(await dateStatus()).toMatchObject({ available: true, remaining: 1 });
    expect((await website({ customerName: "Pengganti" })).ok).toBe(true);
    expectFull(await website());
  });
});

describe("D. expired reservation frees the slot (FD-12, FD-14)", () => {
  it("10 active incl. one unpaid QRIS → after its 30-minute reservation the slot is available (before and after the sweeper)", async () => {
    await fill(9);
    const qris = await website({ paymentMethod: "QRIS" });
    expect(qris.ok).toBe(true);
    expectFull(await website());

    clock.set(new Date(START.getTime() + 29 * 60_000));
    expectFull(await website()); // still reserved

    clock.set(new Date(START.getTime() + 30 * 60_000)); // expiry instant: no longer counts (lazy expiry, TD-07)
    expect(await used()).toBe(9);
    expect(await dateStatus()).toMatchObject({ available: true, remaining: 1 });

    await expireDueReservations(handle.db, clock);
    const [row] = await handle.db.select().from(orders).where(eq(orders.id, qris.ok ? qris.order.orderId : ""));
    expect(row).toMatchObject({ orderStatus: "CANCELLED", paymentStatus: "EXPIRED" });
    expect((await website({ customerName: "Setelah expired" })).ok).toBe(true);
    expectFull(await website());
  });

  it("Cash orders never expire, so they keep their slot", async () => {
    await fill(10, { paymentMethod: "CASH" });
    clock.set(new Date(START.getTime() + 3 * 3_600_000));
    expectFull(await website());
  });
});

describe("E. website and Manual Order share one capacity; only admins can override", () => {
  it("5 website + 5 Manual Order fill the date; both channels are then refused", async () => {
    await fill(5);
    for (let i = 0; i < 5; i++) expect((await manual({ customerName: `Manual ${i}` })).ok).toBe(true);
    expect(await used()).toBe(10);
    expectFull(await website());
    expect(await manual()).toMatchObject({ ok: false, code: "OVERRIDE_REQUIRED", required: [{ type: "DAILY_CAPACITY" }] });
  });

  it("Manual Order with an explicit DAILY_CAPACITY override and reason creates order 11; customers stay refused", async () => {
    await fill(10);
    expect(await manual({}, [{ type: "DAILY_CAPACITY", reason: "" }])).toMatchObject({ ok: false, code: "OVERRIDE_REQUIRED" });
    const r = await manual({ customerName: "Pesanan khusus" }, [{ type: "DAILY_CAPACITY", reason: "Pelanggan tetap, disetujui pemilik" }]);
    expect(r.ok).toBe(true);
    expect(await used()).toBe(11);
    expectFull(await website());
  });

  it("customer checkout has no override channel: extra override fields in the payload are ignored", async () => {
    await fill(10);
    const crafted = { ...input(), overrides: [{ type: "DAILY_CAPACITY", reason: "please" }], capacity: 99, capacityOverride: 99, source: "MANUAL", createdByAdminId: ADMIN_ID };
    expectFull(await placeOrder(deps(), crafted, { idempotencyKey: randomUUID(), clientIp: "ip-crafted" }));
    expect(await ordersOnDate()).toBe(10);
    expect(await handle.db.select().from(pickupDates).where(eq(pickupDates.date, DATE))).toMatchObject([{ capacityOverride: null }]);
  });
});
