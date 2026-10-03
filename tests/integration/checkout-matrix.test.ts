import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import { createFixedClock } from "@/server/clock";
import { createDatabase, type DatabaseHandle } from "@/server/db/client";
import { categories, orderItems, orders, paymentTransactions, pickupDates, products, settings } from "@/server/db/schema";
import { parseIsoDate } from "@/server/domain/time/wib";
import { countActiveOrders } from "@/server/services/capacity";
import { getPickupAvailability } from "@/server/services/checkout";
import { placeOrder, type PlaceOrderDeps, type PlaceOrderResult } from "@/server/services/place-order";

/**
 * Checkout matrix (A–G) against the authoritative order-creation path. placeOrder is
 * what the "Buat Pesanan" server action calls with the raw browser payload, so every
 * case here is also a "modified payload / direct invocation" case: nothing the UI
 * does is assumed. Rules: FD-03, FD-05, FD-08, FD-17..21, FD-27, FD-28, FD-32, FD-108;
 * PRD §7–§9 (§8.1: one order = one pickup date).
 */
let handle: DatabaseHandle;
const ids: Record<string, string> = {};
let categoryId = "";
const START = new Date("2026-10-02T03:00:00Z"); // Friday 2 Oct 2026, 10:00 WIB; cutoff 15:00
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
  await handle.db.execute(sql`TRUNCATE orders, pickup_dates, product_images, products, categories, settings, rate_limits, audit_logs RESTART IDENTITY CASCADE`);
  const [cat] = await handle.db.insert(categories).values({ name: "Cakes", slug: "cakes" }).returning({ id: categories.id });
  categoryId = cat!.id;
  const rows = await handle.db
    .insert(products)
    .values([
      { categoryId, name: "Brownies", slug: "brownies", price: 85_000, productType: "READY_STOCK" },
      { categoryId, name: "Cookies", slug: "cookies", price: 40_000, salePrice: 35_000, productType: "READY_STOCK", maxQuantityPerOrder: 5 },
      { categoryId, name: "Lapis", slug: "lapis", price: 150_000, productType: "PRE_ORDER", minimumPreorderDays: 1 },
      { categoryId, name: "Cheesecake", slug: "cheesecake", price: 250_000, productType: "PRE_ORDER", minimumPreorderDays: 2 },
      { categoryId, name: "Birthday", slug: "birthday", price: 400_000, productType: "PRE_ORDER", minimumPreorderDays: 3 },
    ])
    .returning({ id: products.id, slug: products.slug });
  for (const r of rows) ids[r.slug] = r.id;
});

const line = (slug: string, quantity = 1) => ({ productId: ids[slug]!, quantity });

const input = (over: Record<string, unknown> = {}) => ({
  items: [line("brownies")],
  customerName: "Sari",
  whatsapp: "0812 3456 7890",
  notes: "",
  pickupDate: "2026-10-02",
  paymentMethod: "QRIS",
  paymentOption: "FULL",
  ...over,
});

const placeRaw = (payload: unknown) => placeOrder(deps(), payload, { idempotencyKey: randomUUID(), clientIp: `ip-${randomUUID()}` });
const place = (over: Record<string, unknown> = {}) => placeRaw(input(over));

async function expectAccepted(over: Record<string, unknown>) {
  const r = await place(over);
  if (!r.ok) throw new Error(`expected an order, got ${JSON.stringify(r)}`);
  return r.order;
}
function expectPickupRejected(r: PlaceOrderResult, reason: string) {
  expect(r).toMatchObject({ ok: false, code: "CHECKOUT_INVALID", pickupReason: reason, fieldErrors: { pickupDate: expect.any(String) } });
}
const orderCount = async () => (await handle.db.select({ id: orders.id }).from(orders)).length;

describe("A. Ready Stock dates", () => {
  it("A1 no pickup date (empty, missing, null) → rejected, no order", async () => {
    for (const pickupDate of ["", undefined, null]) {
      expect(await place({ pickupDate })).toMatchObject({ ok: false, code: "CHECKOUT_INVALID", fieldErrors: { pickupDate: "Pilih tanggal pickup." } });
    }
    expect(await orderCount()).toBe(0);
  });

  it("A2 valid date (same day before cutoff) → accepted", async () => {
    expect((await expectAccepted({ pickupDate: "2026-10-02" })).pickupDate).toBe("2026-10-02");
  });

  it("A3/A4 full or blocked date → rejected even though the payload names it explicitly", async () => {
    await handle.db.insert(pickupDates).values([
      { date: "2026-10-03", capacityOverride: 0 },
      { date: "2026-10-04", isBlocked: true },
    ]);
    expectPickupRejected(await place({ pickupDate: "2026-10-03" }), "FULL");
    expectPickupRejected(await place({ pickupDate: "2026-10-04" }), "BLOCKED");
    expect(await orderCount()).toBe(0);
  });

  it("A5 booking horizon: day 60 accepted, day 61 rejected", async () => {
    expectPickupRejected(await place({ pickupDate: "2026-12-02" }), "OUTSIDE_HORIZON");
    expect((await expectAccepted({ pickupDate: "2026-12-01" })).pickupDate).toBe("2026-12-01");
  });

  it("A6 cutoff: 14:59 WIB same day OK; 15:00 and 15:01 WIB → same day refused, next day is the earliest", async () => {
    clock.set(new Date("2026-10-02T07:59:00Z")); // 14:59 WIB
    await expectAccepted({ pickupDate: "2026-10-02" });
    for (const instant of ["2026-10-02T08:00:00Z", "2026-10-02T08:01:00Z"]) {
      clock.set(new Date(instant));
      expectPickupRejected(await place({ pickupDate: "2026-10-02" }), "CUTOFF_PASSED");
      const availability = await getPickupAvailability(deps(), [line("brownies")]);
      expect(availability.window.earliestDate).toBe("2026-10-03");
    }
    await expectAccepted({ pickupDate: "2026-10-03" });
  });

  it("A6 midnight: at 00:00 WIB 'today' is the new WIB date; yesterday is a past date", async () => {
    clock.set(new Date("2026-10-02T17:00:00Z")); // 3 Oct 00:00 WIB, still 2 Oct in UTC
    expectPickupRejected(await place({ pickupDate: "2026-10-02" }), "PAST_DATE");
    await expectAccepted({ pickupDate: "2026-10-03" });
  });
});

describe("B. Pre-Order dates (minimum 2 days unless stated)", () => {
  const preorder = (over: Record<string, unknown> = {}) => ({ items: [line("cheesecake")], ...over });

  it("B7 no date → rejected", async () => {
    expect(await place(preorder({ pickupDate: "" }))).toMatchObject({ ok: false, fieldErrors: { pickupDate: expect.any(String) } });
  });

  it("B8 too early (today and today+1) → rejected PREORDER_MIN_NOT_MET, no order", async () => {
    expectPickupRejected(await place(preorder({ pickupDate: "2026-10-02" })), "PREORDER_MIN_NOT_MET");
    expectPickupRejected(await place(preorder({ pickupDate: "2026-10-03" })), "PREORDER_MIN_NOT_MET");
    expect(await orderCount()).toBe(0);
  });

  it("B9/B10 exactly the minimum and later → accepted", async () => {
    await expectAccepted(preorder({ pickupDate: "2026-10-04" }));
    await expectAccepted(preorder({ pickupDate: "2026-10-09" }));
  });

  it("B11/B12 blocked or full date after the minimum → rejected", async () => {
    await handle.db.insert(pickupDates).values([
      { date: "2026-10-05", isBlocked: true },
      { date: "2026-10-06", capacityOverride: 0 },
    ]);
    expectPickupRejected(await place(preorder({ pickupDate: "2026-10-05" })), "BLOCKED");
    expectPickupRejected(await place(preorder({ pickupDate: "2026-10-06" })), "FULL");
  });

  it("B13 beyond the booking horizon → rejected", async () => {
    expectPickupRejected(await place(preorder({ pickupDate: "2026-12-02" })), "OUTSIDE_HORIZON");
  });

  it("B14 cutoff moves the effective order date: at 15:00 WIB the earliest is effective + 2", async () => {
    clock.set(new Date("2026-10-02T08:00:00Z")); // 15:00 WIB → effective date 3 Oct
    expectPickupRejected(await place(preorder({ pickupDate: "2026-10-04" })), "PREORDER_MIN_NOT_MET");
    await expectAccepted(preorder({ pickupDate: "2026-10-05" }));
  });
});

describe("C. Mixed carts — current rule: one order, one pickup date (PRD §8.1, FD-04, FD-18)", () => {
  it("C17 Ready Stock + Pre-Order: one order with one pickup date that satisfies the Pre-Order minimum", async () => {
    const order = await expectAccepted({ items: [line("brownies"), line("cheesecake")], pickupDate: "2026-10-04" });
    const [row] = await handle.db.select().from(orders).where(eq(orders.id, order.orderId));
    expect(row!.pickupDate).toBe("2026-10-04");
    const items = await handle.db.select().from(orderItems).where(eq(orderItems.orderId, order.orderId));
    expect(items.map((i) => i.productTypeSnapshot).sort()).toEqual(["PRE_ORDER", "READY_STOCK"]);
  });

  it("C18 a date valid for the Ready Stock item but too early for the Pre-Order item → rejected (no partial order)", async () => {
    expectPickupRejected(await place({ items: [line("brownies"), line("cheesecake")], pickupDate: "2026-10-02" }), "PREORDER_MIN_NOT_MET");
    expect(await handle.db.select().from(orderItems)).toHaveLength(0);
  });

  it("C19 a date valid for the Pre-Order item but blocked → rejected", async () => {
    await handle.db.insert(pickupDates).values({ date: "2026-10-05", isBlocked: true });
    expectPickupRejected(await place({ items: [line("brownies"), line("cheesecake")], pickupDate: "2026-10-05" }), "BLOCKED");
  });

  it("C20 two Pre-Order products (1 and 3 days): the longest minimum is enforced", async () => {
    // Both orders of the lines: the result must not depend on which product comes last.
    for (const items of [[line("lapis"), line("birthday")], [line("birthday"), line("lapis")], [line("birthday"), line("brownies"), line("lapis")]]) {
      expectPickupRejected(await place({ items, pickupDate: "2026-10-03" }), "PREORDER_MIN_NOT_MET");
      expectPickupRejected(await place({ items, pickupDate: "2026-10-04" }), "PREORDER_MIN_NOT_MET");
    }
    await expectAccepted({ items: [line("birthday"), line("lapis")], pickupDate: "2026-10-05" });
  });

  it("C21 several Ready Stock products and units → one order, one capacity slot (FD-03, FD-28)", async () => {
    await expectAccepted({ items: [line("brownies", 7), line("cookies", 5)], pickupDate: "2026-10-03" });
    expect((await countActiveOrders(handle.db, [parseIsoDate("2026-10-03")], START)).get("2026-10-03")).toBe(1);
  });

  it("C21 per-product max quantity is enforced on the server", async () => {
    expect(await place({ items: [line("cookies", 6)] })).toMatchObject({ ok: false, cartIssues: [{ issue: "EXCEEDS_MAX_QUANTITY" }] });
  });

  it("C17 a per-item pickup date in the payload is ignored: the order-level date is the only one evaluated", async () => {
    const items = [{ ...line("brownies"), pickupDate: "2026-10-02" }, { ...line("cheesecake"), pickupDate: "2026-10-04" }];
    expectPickupRejected(await place({ items, pickupDate: "2026-10-02" }), "PREORDER_MIN_NOT_MET");
    expect(await orderCount()).toBe(0);
  });
});

describe("D. Capacity — 1 order = 1 slot (FD-02, FD-03, FD-05)", () => {
  it("D22 one slot → one order, the next is FULL", async () => {
    await handle.db.insert(pickupDates).values({ date: "2026-10-05", capacityOverride: 1 });
    await expectAccepted({ pickupDate: "2026-10-05" });
    expectPickupRejected(await place({ pickupDate: "2026-10-05" }), "FULL");
  });

  it("D23 two concurrent attempts for the last slot → exactly one succeeds", async () => {
    await handle.db.insert(pickupDates).values({ date: "2026-10-05", capacityOverride: 1 });
    const results = await Promise.all([place({ pickupDate: "2026-10-05" }), place({ pickupDate: "2026-10-05", items: [line("cheesecake")] })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await orderCount()).toBe(1);
  });

  it("D24/D25 many concurrent mixed carts never exceed capacity; each order uses exactly one slot", async () => {
    await handle.db.insert(pickupDates).values({ date: "2026-10-06", capacityOverride: 3 });
    const carts = [[line("brownies", 3), line("cheesecake", 2)], [line("birthday")], [line("cookies"), line("lapis"), line("brownies")]];
    const results = await Promise.all(Array.from({ length: 24 }, (_, i) => place({ pickupDate: "2026-10-06", items: carts[i % carts.length] })));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    for (const r of results.filter((r) => !r.ok)) expectPickupRejected(r, "FULL");
    expect((await countActiveOrders(handle.db, [parseIsoDate("2026-10-06")], START)).get("2026-10-06")).toBe(3);
    expect(await orderCount()).toBe(3);
  });
});

describe("E. Stale cart — current product data is authoritative (FD-27, FD-32)", () => {
  it("E26 product became Sold Out after it was added → rejected", async () => {
    await handle.db.update(products).set({ availability: "SOLD_OUT" }).where(eq(products.id, ids.brownies!));
    expect(await place()).toMatchObject({ ok: false, code: "CHECKOUT_INVALID", cartIssues: [{ productId: ids.brownies, issue: "SOLD_OUT" }] });
  });

  it("E27 product or its category became inactive → rejected", async () => {
    await handle.db.update(products).set({ isActive: false }).where(eq(products.id, ids.brownies!));
    expect(await place()).toMatchObject({ ok: false, cartIssues: [{ issue: "NOT_AVAILABLE" }] });
    await handle.db.update(products).set({ isActive: true }).where(eq(products.id, ids.brownies!));
    await handle.db.update(categories).set({ isActive: false }).where(eq(categories.id, categoryId));
    expect(await place()).toMatchObject({ ok: false, cartIssues: [{ issue: "NOT_AVAILABLE" }] });
    expect(await orderCount()).toBe(0);
  });

  it("E28/E29 price and sale price changes are recalculated; client-sent prices are ignored", async () => {
    await handle.db.update(products).set({ price: 90_000, salePrice: 80_000 }).where(eq(products.id, ids.brownies!));
    const order = await expectAccepted({ items: [{ ...line("brownies", 2), price: 1, unitPrice: 1, salePrice: 0 }], grandTotal: 1 });
    expect(order.payment.total).toBe(160_000);
    const [item] = await handle.db.select().from(orderItems).where(eq(orderItems.orderId, order.orderId));
    expect(item).toMatchObject({ unitPriceSnapshot: 90_000, salePriceSnapshot: 80_000, effectiveUnitPrice: 80_000, lineSubtotal: 160_000 });

    await handle.db.update(products).set({ salePrice: null }).where(eq(products.id, ids.brownies!));
    expect((await expectAccepted({ items: [line("brownies", 2)] })).payment.total).toBe(180_000);
  });

  it("E30 minimum_preorder_days raised after the cart was built → the date that was valid is now rejected", async () => {
    await expectAccepted({ items: [line("cheesecake")], pickupDate: "2026-10-04" });
    await handle.db.update(products).set({ minimumPreorderDays: 4 }).where(eq(products.id, ids.cheesecake!));
    expectPickupRejected(await place({ items: [line("cheesecake")], pickupDate: "2026-10-04" }), "PREORDER_MIN_NOT_MET");
    const [item] = await handle.db.select().from(orderItems);
    expect(item!.minimumPreorderDaysSnapshot).toBe(2); // the earlier order keeps what it was validated against
  });

  it("E product switched from Ready Stock to Pre-Order → Cash and same-day pickup are refused", async () => {
    await handle.db.update(products).set({ productType: "PRE_ORDER", minimumPreorderDays: 1 }).where(eq(products.id, ids.brownies!));
    expect(await place({ paymentMethod: "CASH" })).toMatchObject({ ok: false, fieldErrors: { paymentMethod: expect.any(String) } });
    expectPickupRejected(await place({ pickupDate: "2026-10-02" }), "PREORDER_MIN_NOT_MET");
  });
});

describe("F/G. Payment boundary and crafted payloads", () => {
  it("F31 a rejected date never creates an order or a payment transaction", async () => {
    await handle.db.insert(pickupDates).values({ date: "2026-10-04", isBlocked: true });
    await place({ items: [line("cheesecake")], pickupDate: "2026-10-03" });
    await place({ pickupDate: "2026-10-04" });
    expect(await handle.db.select().from(paymentTransactions)).toHaveLength(0);
    expect(await orderCount()).toBe(0);
  });

  it("G malformed or manipulated dates are rejected", async () => {
    const bad: unknown[] = ["2026-02-30", "2026-13-01", "2026-10-4", "04/10/2026", "2026-10-04T00:00:00Z", " 2026-10-04", "2026-10-04 ", 20261004, ["2026-10-04"], { date: "2026-10-04" }, "1970-01-01", "9999-12-31"];
    for (const pickupDate of bad) {
      const r = await place({ pickupDate });
      expect(r.ok, `pickupDate=${JSON.stringify(pickupDate)}`).toBe(false);
    }
    expect(await orderCount()).toBe(0);
  });

  it("G invalid product ids and quantities are rejected", async () => {
    const badItems: unknown[] = [
      [],
      [{ productId: "not-a-uuid", quantity: 1 }],
      [{ productId: randomUUID(), quantity: 1 }],
      [line("brownies", 0)],
      [line("brownies", -1)],
      [line("brownies", 1.5)],
      [{ productId: ids.brownies, quantity: "2" }],
      [{ productId: ids.brownies }],
      [line("brownies"), line("brownies")],
      [line("brownies", 2_147_483_647)],
      "brownies",
      null,
    ];
    for (const items of badItems) {
      const r = await place({ items });
      expect(r.ok, `items=${JSON.stringify(items)}`).toBe(false);
    }
    expect(await orderCount()).toBe(0);
  });

  it("G a non-object payload is rejected without throwing", async () => {
    for (const payload of [null, "x", 42, [], { items: "x" }]) expect((await placeRaw(payload)).ok).toBe(false);
  });

  it("settings are authoritative: a stricter cutoff/horizon set by the admin applies immediately", async () => {
    await handle.db.insert(settings).values([
      { key: "pickup_cutoff", value: "09:00" },
      { key: "booking_horizon_days", value: 5 },
    ]);
    expectPickupRejected(await place({ pickupDate: "2026-10-02" }), "CUTOFF_PASSED"); // 10:00 WIB is past 09:00
    expectPickupRejected(await place({ pickupDate: "2026-10-08" }), "OUTSIDE_HORIZON");
    await expectAccepted({ pickupDate: "2026-10-07" });
  });
});
