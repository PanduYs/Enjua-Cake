import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createFixedClock } from "@/server/clock";
import type { DatabaseHandle } from "@/server/db/client";
import { categories, pickupDates, products, settings } from "@/server/db/schema";
import { getPickupAvailability, previewCheckout, validateCart, type CheckoutDeps } from "@/server/services/checkout";

import { openTestDatabase } from "../support/db";
import { insertTestOrder } from "../support/orders";

let handle: DatabaseHandle;
const ids: Record<string, string> = {};
const clock = createFixedClock(new Date("2026-10-02T03:00:00Z")); // 10:00 WIB
const deps = (): CheckoutDeps => ({ db: handle.db, clock, publicBucket: { publicUrl: (k: string) => `/storage/${k}` } });

beforeAll(() => {
  handle = openTestDatabase();
});
afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  clock.set(new Date("2026-10-02T03:00:00Z"));
  await handle.db.execute(sql`TRUNCATE orders, pickup_dates, product_images, products, categories, settings RESTART IDENTITY CASCADE`);
  const [cat] = await handle.db.insert(categories).values({ name: "Cakes", slug: "cakes" }).returning({ id: categories.id });
  const rows = await handle.db
    .insert(products)
    .values([
      { categoryId: cat!.id, name: "Brownies", slug: "brownies", price: 85_000, productType: "READY_STOCK" },
      { categoryId: cat!.id, name: "Cheesecake", slug: "cheesecake", price: 250_000, salePrice: 225_000, productType: "PRE_ORDER", minimumPreorderDays: 2 },
      { categoryId: cat!.id, name: "Kue Ultah", slug: "kue-ultah", price: 300_000, productType: "PRE_ORDER", minimumPreorderDays: 3, maxQuantityPerOrder: 2 },
      { categoryId: cat!.id, name: "Pudding", slug: "pudding", price: 45_000, productType: "READY_STOCK", availability: "SOLD_OUT" },
      { categoryId: cat!.id, name: "Odd", slug: "odd", price: 125_555, productType: "READY_STOCK" },
      { categoryId: cat!.id, name: "Nonaktif", slug: "nonaktif", price: 1_000, productType: "READY_STOCK", isActive: false },
    ])
    .returning({ id: products.id, slug: products.slug });
  for (const r of rows) ids[r.slug] = r.id;
});

const base = (over: Record<string, unknown> = {}) => ({
  items: [{ productId: ids.brownies, quantity: 1 }],
  customerName: "Sari",
  whatsapp: "0812 3456 7890",
  notes: "",
  pickupDate: "2026-10-02",
  paymentMethod: "CASH",
  paymentOption: "FULL",
  ...over,
});

describe("validateCart", () => {
  it("prices from the database, never from the client", async () => {
    const result = await validateCart(deps(), [{ productId: ids.cheesecake, quantity: 2, price: 1 }]);
    expect(result.canCheckout).toBe(true);
    expect(result.totals).toMatchObject({ subtotal: 500_000, discountTotal: 50_000, grandTotal: 450_000 });
    expect(result.hasPreorder).toBe(true);
  });

  it("flags Sold Out, inactive, and over-max items and blocks checkout", async () => {
    const result = await validateCart(deps(), [
      { productId: ids.pudding, quantity: 1 },
      { productId: ids.nonaktif, quantity: 1 },
      { productId: ids["kue-ultah"], quantity: 3 },
      { productId: ids.brownies, quantity: 1 },
    ]);
    expect(result.lines.map((l) => l.issue)).toEqual(["SOLD_OUT", "NOT_AVAILABLE", "EXCEEDS_MAX_QUANTITY", null]);
    expect(result.lines[1]?.product).toBeNull(); // inactive product details are not exposed
    expect(result.canCheckout).toBe(false);
    expect(result.totals.grandTotal).toBe(85_000);
  });

  it("returns an empty, non-checkoutable result for malformed input", async () => {
    expect((await validateCart(deps(), "nope")).canCheckout).toBe(false);
    expect((await validateCart(deps(), [])).canCheckout).toBe(false);
  });
});

describe("getPickupAvailability", () => {
  it("Ready Stock same-day before cutoff; 61 dates in the default horizon", async () => {
    const a = await getPickupAvailability(deps(), [{ productId: ids.brownies, quantity: 1 }]);
    expect(a.dates).toHaveLength(61);
    expect(a.dates[0]).toEqual({ date: "2026-10-02", available: true, remaining: 10 });
    expect(a.cutoff).toBe("15:00");
  });

  it("after cutoff, today shows CUTOFF_PASSED for Ready Stock", async () => {
    clock.set(new Date("2026-10-02T08:00:00Z")); // 15:00 WIB exactly
    const a = await getPickupAvailability(deps(), [{ productId: ids.brownies, quantity: 1 }]);
    expect(a.dates[0]).toMatchObject({ date: "2026-10-02", available: false, reason: "CUTOFF_PASSED" });
    expect(a.dates[1]).toMatchObject({ available: true });
  });

  it("mixed cart follows the longest Pre-Order minimum and settings overrides", async () => {
    await handle.db.insert(settings).values([
      { key: "booking_horizon_days", value: 30 },
      { key: "default_capacity", value: 2 },
    ]);
    await handle.db.insert(pickupDates).values([{ date: "2026-10-06", isBlocked: true }]);
    await insertTestOrder(handle.db, { pickupDate: "2026-10-07", paymentMethod: "CASH", paymentStatus: "UNPAID" });
    await insertTestOrder(handle.db, { pickupDate: "2026-10-07", paymentMethod: "CASH", paymentStatus: "UNPAID" });

    const a = await getPickupAvailability(deps(), [
      { productId: ids.brownies, quantity: 1 },
      { productId: ids.cheesecake, quantity: 1 },
      { productId: ids["kue-ultah"], quantity: 1 },
    ]);
    const byDate = Object.fromEntries(a.dates.map((d) => [d.date, d]));
    expect(a.dates).toHaveLength(31);
    expect(byDate["2026-10-04"]).toMatchObject({ available: false, reason: "PREORDER_MIN_NOT_MET" });
    expect(byDate["2026-10-05"]).toMatchObject({ available: true, remaining: 2 });
    expect(byDate["2026-10-06"]).toMatchObject({ available: false, reason: "BLOCKED" });
    expect(byDate["2026-10-07"]).toMatchObject({ available: false, reason: "FULL" });
  });
});

describe("previewCheckout", () => {
  it("returns a server-computed summary with normalized phone", async () => {
    const r = await previewCheckout(deps(), base({ notes: "  Tulis 'Selamat'  " }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary).toMatchObject({
      customerName: "Sari",
      whatsapp: "+6281234567890",
      notes: "Tulis 'Selamat'",
      pickupDate: "2026-10-02",
      payment: { total: 85_000, dpAmount: null, dueNow: 85_000, remaining: 0 },
    });
  });

  it("DP 50% uses ceil (FD-44)", async () => {
    const r = await previewCheckout(deps(), base({ items: [{ productId: ids.odd, quantity: 1 }], paymentMethod: "QRIS", paymentOption: "DP_50" }));
    expect(r.ok && r.summary.payment).toEqual({ total: 125_555, dpAmount: 62_778, dueNow: 62_778, remaining: 62_777 });
  });

  it("rejects Cash for orders with Pre-Order even if the UI is bypassed (EC-16)", async () => {
    const r = await previewCheckout(deps(), base({ items: [{ productId: ids.cheesecake, quantity: 1 }], pickupDate: "2026-10-05" }));
    expect(r).toMatchObject({ ok: false, fieldErrors: { paymentMethod: expect.any(String) } });
  });

  it("rejects DP for Cash", async () => {
    const r = await previewCheckout(deps(), base({ paymentOption: "DP_50" }));
    expect(r).toMatchObject({ ok: false, fieldErrors: { paymentOption: expect.any(String) } });
  });

  it("re-validates the date on the server: lead time, cutoff, horizon, full", async () => {
    const preorder = { items: [{ productId: ids.cheesecake, quantity: 1 }], paymentMethod: "QRIS" };
    expect(await previewCheckout(deps(), base({ ...preorder, pickupDate: "2026-10-03" }))).toMatchObject({ ok: false, pickupReason: "PREORDER_MIN_NOT_MET" });
    expect((await previewCheckout(deps(), base({ ...preorder, pickupDate: "2026-10-04" }))).ok).toBe(true);
    expect(await previewCheckout(deps(), base({ pickupDate: "2026-12-02" }))).toMatchObject({ ok: false, pickupReason: "OUTSIDE_HORIZON" });

    clock.set(new Date("2026-10-02T08:30:00Z")); // 15:30 WIB (EC-17)
    expect(await previewCheckout(deps(), base())).toMatchObject({ ok: false, pickupReason: "CUTOFF_PASSED" });

    await handle.db.insert(pickupDates).values({ date: "2026-10-03", capacityOverride: 0 });
    expect(await previewCheckout(deps(), base({ pickupDate: "2026-10-03" }))).toMatchObject({ ok: false, pickupReason: "FULL" });
  });

  it("validates customer data with Indonesian messages", async () => {
    const r = await previewCheckout(deps(), base({ customerName: "  ", whatsapp: "021555123" }));
    expect(r).toMatchObject({
      ok: false,
      fieldErrors: { customerName: "Masukkan nama.", whatsapp: expect.stringContaining("WhatsApp Indonesia") },
    });
  });

  it("refuses carts with unavailable items and reports them", async () => {
    const r = await previewCheckout(deps(), base({ items: [{ productId: ids.pudding, quantity: 1 }] }));
    expect(r).toMatchObject({ ok: false, cartIssues: [{ productId: ids.pudding, issue: "SOLD_OUT" }] });
  });
});
