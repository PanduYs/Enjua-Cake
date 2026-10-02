import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import { createFixedClock } from "@/server/clock";
import { createDatabase, type DatabaseHandle } from "@/server/db/client";
import { adminAccounts, admins, adminSessions, auditLogs, categories, orderOverrides, orders, pickupDates, productImages, products, settings } from "@/server/db/schema";
import { verifyPassword } from "@/server/security/password";
import { listCapacity, updatePickupDate } from "@/server/services/admin-capacity";
import {
  addProductImage,
  createProduct,
  deleteCategory,
  deleteProduct,
  deleteProductImage,
  saveCategory,
  setMainProductImage,
  updateProduct,
} from "@/server/services/admin-catalog";
import { getDashboard } from "@/server/services/admin-dashboard";
import { updateWebsiteSettings } from "@/server/services/admin-settings";
import { createAdmin, resetAdminPassword, setAdminActive } from "@/server/services/admin-users";
import { listProducts } from "@/server/services/catalog";
import { placeManualOrder } from "@/server/services/manual-order";
import { markCashPaid } from "@/server/services/payment-admin";
import { placeOrder } from "@/server/services/place-order";

let handle: DatabaseHandle;
const START = new Date("2026-10-02T03:00:00Z"); // 10:00 WIB
const clock = createFixedClock(START);
const ADMIN = "admin-p6";
const stored = new Map<string, Uint8Array>();
const bucket = {
  put: async (key: string, body: Uint8Array) => {
    stored.set(key, body);
    return { key, contentType: "image/webp", size: body.byteLength };
  },
  delete: async (key: string) => void stored.delete(key),
  publicUrl: (key: string) => `/storage/${key}`,
};
const cat = () => ({ db: handle.db, publicBucket: bucket });
const checkoutDeps = () => ({ db: handle.db, clock, publicBucket: bucket });
let png: Uint8Array;
let categoryId: string;

beforeAll(async () => {
  handle = createDatabase(inject("databaseUrl"), { max: 20, silenceNotices: true });
  png = new Uint8Array(await sharp({ create: { width: 40, height: 30, channels: 3, background: "#C98A92" } }).png().toBuffer());
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  clock.set(START);
  stored.clear();
  await handle.db.execute(
    sql`TRUNCATE orders, pickup_dates, product_images, products, categories, settings, rate_limits, audit_logs, payment_webhook_events, admin_sessions, admin_accounts, admins RESTART IDENTITY CASCADE`,
  );
  await handle.db.insert(admins).values({ id: ADMIN, name: "Admin Enam", email: "enam@example.test" });
  categoryId = (await handle.db.insert(categories).values({ name: "Cakes", slug: "cakes" }).returning({ id: categories.id }))[0]!.id;
});

const productInput = (over: Record<string, unknown> = {}) => ({
  name: "Brownies Cokelat",
  slug: "",
  description: "Brownies lembut.",
  categoryId,
  price: "85000",
  salePrice: "",
  productType: "READY_STOCK",
  minimumPreorderDays: "",
  availability: "AVAILABLE",
  maxQuantityPerOrder: "",
  isFeatured: false,
  isActive: true,
  ...over,
});

async function newProduct(over: Record<string, unknown> = {}) {
  const r = await createProduct(cat(), { input: productInput(over), mainImage: png, mainImageAlt: "Foto brownies", adminId: ADMIN });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.productId;
}

const audits = (eventType: string) => handle.db.select().from(auditLogs).where(eq(auditLogs.eventType, eventType));

describe("products & categories (PRD §31, FD-22–FD-27)", () => {
  it("creates a product with exactly one main WebP photo, auto slug, and an audit entry", async () => {
    const id = await newProduct();
    const second = await newProduct();
    const [p1] = await handle.db.select().from(products).where(eq(products.id, id));
    const [p2] = await handle.db.select().from(products).where(eq(products.id, second));
    expect(p1!.slug).toBe("brownies-cokelat");
    expect(p2!.slug).toBe("brownies-cokelat-2");
    const images = await handle.db.select().from(productImages).where(eq(productImages.productId, id));
    expect(images).toEqual([expect.objectContaining({ isMain: true, altText: "Foto brownies" })]);
    expect(images[0]!.storageKey).toMatch(/^products\/[0-9a-f-]{36}\.webp$/);
    const webp = stored.get(images[0]!.storageKey)!;
    expect(String.fromCharCode(...webp.slice(8, 12))).toBe("WEBP");
    expect((await audits("PRODUCT_CREATED")).map((a) => a.actorAdminId)).toEqual([ADMIN, ADMIN]);
  });

  it("rejects bad input and non-image files; nothing is stored", async () => {
    const bad = await createProduct(cat(), { input: productInput({ salePrice: "90000" }), mainImage: png, mainImageAlt: "x", adminId: ADMIN });
    expect(bad).toMatchObject({ ok: false, fieldErrors: { salePrice: expect.any(String) } });
    const svg = new TextEncoder().encode("<svg onload=alert(1)></svg>");
    expect(await createProduct(cat(), { input: productInput(), mainImage: svg, mainImageAlt: "x", adminId: ADMIN })).toMatchObject({ ok: false, fieldErrors: { mainImage: expect.any(String) } });
    expect(await createProduct(cat(), { input: productInput(), mainImage: png, mainImageAlt: "  ", adminId: ADMIN })).toMatchObject({ ok: false, fieldErrors: { mainImageAlt: expect.any(String) } });
    expect(stored.size).toBe(0);
    expect(await handle.db.select().from(products)).toHaveLength(0);
  });

  it("updates with an audited diff; inactive products and categories disappear from the public catalog; Sold Out stays visible", async () => {
    const id = await newProduct();
    expect(await updateProduct(cat(), { productId: id, input: productInput({ salePrice: "75000", availability: "SOLD_OUT", isFeatured: true }), adminId: ADMIN })).toEqual({ ok: true });
    const [audit] = await audits("PRODUCT_UPDATED");
    expect(audit).toMatchObject({ oldValue: { salePrice: null, availability: "AVAILABLE", isFeatured: false }, newValue: { salePrice: 75_000, availability: "SOLD_OUT", isFeatured: true } });
    expect((await listProducts(cat(), {}))[0]).toMatchObject({ soldOut: true, price: { effective: 75_000 } });

    await updateProduct(cat(), { productId: id, input: productInput({ isActive: false }), adminId: ADMIN });
    expect(await listProducts(cat(), {})).toHaveLength(0);
    await updateProduct(cat(), { productId: id, input: productInput({ isActive: true }), adminId: ADMIN });
    await saveCategory(cat(), { categoryId, input: { name: "Cakes", slug: "cakes", description: "", sortOrder: "0", isActive: false }, adminId: ADMIN });
    expect(await listProducts(cat(), {})).toHaveLength(0);
  });

  it("photos: add, switch main, the last photo cannot be removed", async () => {
    const id = await newProduct();
    expect(await addProductImage(cat(), { productId: id, bytes: png, altText: "Tampak samping", makeMain: false, adminId: ADMIN })).toEqual({ ok: true });
    const imgs = await handle.db.select().from(productImages).where(eq(productImages.productId, id));
    const main = imgs.find((i) => i.isMain)!;
    const extra = imgs.find((i) => !i.isMain)!;
    await setMainProductImage(cat(), { imageId: extra.id, adminId: ADMIN });
    expect(await deleteProductImage(cat(), { imageId: extra.id, adminId: ADMIN })).toEqual({ ok: true });
    const left = await handle.db.select().from(productImages).where(eq(productImages.productId, id));
    expect(left).toEqual([expect.objectContaining({ id: main.id, isMain: true })]);
    expect(await deleteProductImage(cat(), { imageId: main.id, adminId: ADMIN })).toEqual({ ok: false, error: "LAST_IMAGE" });
  });

  it("hard delete only for never-ordered products (PRD §31.1); categories with products cannot be deleted", async () => {
    const unused = await newProduct({ name: "Belum Dipesan" });
    expect(await deleteProduct(cat(), { productId: unused, adminId: ADMIN })).toEqual({ ok: true });
    expect(stored.size).toBe(0);

    const ordered = await newProduct();
    const r = await placeOrder(checkoutDeps(), { items: [{ productId: ordered, quantity: 1 }], customerName: "Sari", whatsapp: "081234567890", notes: "", pickupDate: "2026-10-02", paymentMethod: "CASH", paymentOption: "FULL" }, { idempotencyKey: randomUUID(), clientIp: "x" });
    expect(r.ok).toBe(true);
    expect(await deleteProduct(cat(), { productId: ordered, adminId: ADMIN })).toEqual({ ok: false, error: "HAS_ORDERS" });
    expect(await deleteCategory(cat(), { categoryId, adminId: ADMIN })).toEqual({ ok: false, error: "HAS_PRODUCTS" });
    const empty = await saveCategory(cat(), { input: { name: "Kosong", slug: "", description: "", sortOrder: "5", isActive: true }, adminId: ADMIN });
    expect(empty.ok).toBe(true);
    if (empty.ok) expect(await deleteCategory(cat(), { categoryId: empty.categoryId, adminId: ADMIN })).toEqual({ ok: true });
  });
});

describe("Manual Order (PRD §50, FD-80, FD-110, FD-115, FD-119)", () => {
  const manual = (over: Record<string, unknown>, overrides: unknown = [], key = randomUUID()) =>
    placeManualOrder(checkoutDeps(), { customerName: "Pelanggan WA", whatsapp: "081234567890", notes: "", paymentMethod: "CASH", paymentOption: "FULL", ...over }, { adminId: ADMIN, idempotencyKey: key, overrides });

  it("creates a MANUAL order with tracking code, same capacity, audited as the admin", async () => {
    const id = await newProduct();
    const r = await manual({ items: [{ productId: id, quantity: 2 }], pickupDate: "2026-10-03" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order.trackingToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [o] = await handle.db.select().from(orders).where(eq(orders.id, r.order.orderId));
    expect(o).toMatchObject({ source: "MANUAL", createdByAdminId: ADMIN, orderStatus: "NEW", paymentStatus: "UNPAID", grandTotal: 170_000 });
    expect((await audits("ORDER_CREATED"))[0]).toMatchObject({ actorType: "ADMIN", actorAdminId: ADMIN });
    expect(await audits("MANUAL_ORDER_CREATED")).toHaveLength(1);
    expect(await handle.db.select().from(orderOverrides)).toHaveLength(0);
    expect((await listCapacity(handle.db, clock, { from: "2026-10-03", days: 1 })).rows[0]).toMatchObject({ used: 1 });
  });

  it("full date: explicit DAILY_CAPACITY override with reason → order + order_overrides + audit; website still sees FULL", async () => {
    const id = await newProduct();
    await handle.db.insert(pickupDates).values({ date: "2026-10-04", capacityOverride: 1 });
    expect((await manual({ items: [{ productId: id, quantity: 1 }], pickupDate: "2026-10-04" })).ok).toBe(true);

    const blocked = await manual({ items: [{ productId: id, quantity: 1 }], pickupDate: "2026-10-04" });
    expect(blocked).toEqual({ ok: false, code: "OVERRIDE_REQUIRED", required: [{ type: "DAILY_CAPACITY", before: { capacity: 1, used: 1 }, after: { used: 2 } }] });
    // A reason is mandatory.
    expect((await manual({ items: [{ productId: id, quantity: 1 }], pickupDate: "2026-10-04" }, [{ type: "DAILY_CAPACITY", reason: "  " }])).ok).toBe(false);

    const ok = await manual({ items: [{ productId: id, quantity: 1 }], pickupDate: "2026-10-04" }, [{ type: "DAILY_CAPACITY", reason: "Pelanggan tetap, sudah konfirmasi dapur" }]);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(await handle.db.select().from(orderOverrides).where(eq(orderOverrides.orderId, ok.order.orderId))).toEqual([
      expect.objectContaining({ overrideType: "DAILY_CAPACITY", valueBefore: { capacity: 1, used: 1 }, valueAfter: { used: 2 }, reason: "Pelanggan tetap, sudah konfirmasi dapur", adminId: ADMIN }),
    ]);
    expect(await audits("ORDER_OVERRIDE_APPLIED")).toEqual([expect.objectContaining({ actorAdminId: ADMIN, reason: "Pelanggan tetap, sudah konfirmasi dapur" })]);

    const web = await placeOrder(checkoutDeps(), { items: [{ productId: id, quantity: 1 }], customerName: "Web", whatsapp: "081234567890", notes: "", pickupDate: "2026-10-04", paymentMethod: "CASH", paymentOption: "FULL" }, { idempotencyKey: randomUUID(), clientIp: "y" });
    expect(web).toMatchObject({ ok: false, pickupReason: "FULL" });
  });

  it("overrides minimum Pre-Order, cutoff and horizon only when needed; unneeded overrides are not recorded", async () => {
    const pre = await newProduct({ name: "Kue Ultah", productType: "PRE_ORDER", minimumPreorderDays: "3" });
    const r1 = await manual({ items: [{ productId: pre, quantity: 1 }], pickupDate: "2026-10-03", paymentMethod: "QRIS", paymentOption: "DP_50" });
    expect(r1).toMatchObject({ ok: false, code: "OVERRIDE_REQUIRED", required: [{ type: "MIN_PREORDER_DAYS" }] });
    const r2 = await manual({ items: [{ productId: pre, quantity: 1 }], pickupDate: "2026-10-03", paymentMethod: "QRIS", paymentOption: "DP_50" }, [
      { type: "MIN_PREORDER_DAYS", reason: "Bahan sudah tersedia" },
      { type: "DAILY_CAPACITY", reason: "tidak perlu" },
    ]);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect((await handle.db.select().from(orderOverrides).where(eq(orderOverrides.orderId, r2.order.orderId))).map((o) => o.overrideType)).toEqual(["MIN_PREORDER_DAYS"]);
      // Payment rules are not bypassed: QRIS reservation applies like any website order.
      expect(r2.order.reservationExpiresAt).toBe(new Date(START.getTime() + 30 * 60_000).toISOString());
    }

    const ready = await newProduct({ name: "Cookies" });
    clock.set(new Date("2026-10-02T09:00:00Z")); // 16:00 WIB
    expect(await manual({ items: [{ productId: ready, quantity: 1 }], pickupDate: "2026-10-02" })).toMatchObject({ code: "OVERRIDE_REQUIRED", required: [{ type: "PICKUP_CUTOFF" }] });
    expect(await manual({ items: [{ productId: ready, quantity: 1 }], pickupDate: "2026-12-30" })).toMatchObject({ code: "OVERRIDE_REQUIRED", required: [{ type: "BOOKING_HORIZON" }] });
  });

  it("never overrides blocked dates, past dates, Sold Out, or Cash for Pre-Order", async () => {
    const id = await newProduct();
    const pre = await newProduct({ name: "Pre", productType: "PRE_ORDER", minimumPreorderDays: "1" });
    const sold = await newProduct({ name: "Habis", availability: "SOLD_OUT" });
    const all = [{ type: "MIN_PREORDER_DAYS", reason: "x" }, { type: "BOOKING_HORIZON", reason: "x" }, { type: "PICKUP_CUTOFF", reason: "x" }, { type: "DAILY_CAPACITY", reason: "x" }];
    await handle.db.insert(pickupDates).values({ date: "2026-10-05", isBlocked: true });
    expect(await manual({ items: [{ productId: id, quantity: 1 }], pickupDate: "2026-10-05" }, all)).toEqual({ ok: false, code: "DATE_NOT_ALLOWED", blocker: "BLOCKED" });
    expect(await manual({ items: [{ productId: id, quantity: 1 }], pickupDate: "2026-10-01" }, all)).toEqual({ ok: false, code: "DATE_NOT_ALLOWED", blocker: "PAST_DATE" });
    expect(await manual({ items: [{ productId: sold, quantity: 1 }], pickupDate: "2026-10-03" }, all)).toMatchObject({ ok: false, code: "CHECKOUT_INVALID", cartIssues: [{ issue: "SOLD_OUT" }] });
    expect(await manual({ items: [{ productId: pre, quantity: 1 }], pickupDate: "2026-10-03" }, all)).toMatchObject({ ok: false, code: "CHECKOUT_INVALID", fieldErrors: { paymentMethod: expect.any(String) } });
    expect(await manual({ items: [{ productId: id, quantity: 1 }], pickupDate: "2026-10-03" }, [{ type: "STATUS", reason: "x" }])).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(await handle.db.select().from(orders)).toHaveLength(0);
  });

  it("races website checkouts for the last slot under the same lock (EC-19)", async () => {
    const id = await newProduct();
    await handle.db.insert(pickupDates).values({ date: "2026-10-06", capacityOverride: 1 });
    const results = await Promise.all([
      manual({ items: [{ productId: id, quantity: 1 }], pickupDate: "2026-10-06" }),
      ...Array.from({ length: 9 }, () =>
        placeOrder(checkoutDeps(), { items: [{ productId: id, quantity: 1 }], customerName: "Web", whatsapp: "081234567890", notes: "", pickupDate: "2026-10-06", paymentMethod: "CASH", paymentOption: "FULL" }, { idempotencyKey: randomUUID(), clientIp: randomUUID() }),
      ),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await handle.db.select().from(orders).where(eq(orders.pickupDate, "2026-10-06"))).toHaveLength(1);
  });
});

describe("capacity admin (PRD §11, FD-06, FD-07, EC-14)", () => {
  it("blocking/override never cancels existing orders; new orders are refused; every change is audited", async () => {
    const id = await newProduct();
    const r = await placeOrder(checkoutDeps(), { items: [{ productId: id, quantity: 1 }], customerName: "Sari", whatsapp: "081234567890", notes: "", pickupDate: "2026-10-07", paymentMethod: "CASH", paymentOption: "FULL" }, { idempotencyKey: randomUUID(), clientIp: "z" });
    expect(r.ok).toBe(true);

    expect(await updatePickupDate(handle.db, clock, { date: "2026-10-07", adminId: ADMIN, kind: "block", blocked: true, reason: "Libur" })).toEqual({ ok: true, used: 1 });
    expect((await handle.db.select().from(orders))[0]!.orderStatus).toBe("NEW");
    const web = () => placeOrder(checkoutDeps(), { items: [{ productId: id, quantity: 1 }], customerName: "Web", whatsapp: "081234567890", notes: "", pickupDate: "2026-10-07", paymentMethod: "CASH", paymentOption: "FULL" }, { idempotencyKey: randomUUID(), clientIp: randomUUID() });
    expect(await web()).toMatchObject({ ok: false, pickupReason: "BLOCKED" });

    await updatePickupDate(handle.db, clock, { date: "2026-10-07", adminId: ADMIN, kind: "block", blocked: false });
    await updatePickupDate(handle.db, clock, { date: "2026-10-07", adminId: ADMIN, kind: "capacity", capacityOverride: 1 });
    expect(await web()).toMatchObject({ ok: false, pickupReason: "FULL" });
    const view = (await listCapacity(handle.db, clock, { from: "2026-10-07", days: 1 })).rows[0];
    expect(view).toMatchObject({ capacity: 1, capacityOverride: 1, used: 1, remaining: 0, status: "FULL", isBlocked: false, blockReason: null });

    await updatePickupDate(handle.db, clock, { date: "2026-10-07", adminId: ADMIN, kind: "capacity", capacityOverride: null });
    expect((await web()).ok).toBe(true);

    const events = await handle.db.select().from(auditLogs).where(eq(auditLogs.entityType, "pickup_date"));
    expect(events.map((e) => e.eventType)).toEqual(["DATE_BLOCKED", "DATE_UNBLOCKED", "CAPACITY_OVERRIDE_CHANGED", "CAPACITY_OVERRIDE_CHANGED"]);
    expect(await updatePickupDate(handle.db, clock, { date: "2026-10-01", adminId: ADMIN, kind: "block", blocked: true })).toEqual({ ok: false, error: "PAST_DATE" });
    expect(await updatePickupDate(handle.db, clock, { date: "2026-10-08", adminId: ADMIN, kind: "capacity", capacityOverride: -1 })).toEqual({ ok: false, error: "INVALID_CAPACITY" });
  });
});

describe("website settings (PRD §32, TD-18)", () => {
  const form = (over: Record<string, unknown> = {}) => ({
    business_name: "Enjua Cake's",
    business_description: "",
    address: "",
    whatsapp_number: "",
    operating_hours: "",
    pickup_hours: "",
    pickup_instructions: "",
    payment_instructions: "",
    pickup_cutoff: "15:00",
    default_capacity: "10",
    booking_horizon_days: "60",
    qris_reservation_minutes: "30",
    transfer_reservation_minutes: "120",
    bank_accounts: [],
    social_links: [],
    policy_links: [],
    ...over,
  });

  it("saves only changed keys with an audit entry; new values apply to new orders only", async () => {
    expect(await updateWebsiteSettings(handle.db, form(), ADMIN)).toEqual({ ok: true, changed: [] });
    const r = await updateWebsiteSettings(handle.db, form({ qris_reservation_minutes: "45", whatsapp_number: "0812 1111 2222", default_capacity: "12" }), ADMIN);
    expect(r).toEqual({ ok: true, changed: ["whatsapp_number", "default_capacity", "qris_reservation_minutes"] });
    const rows = await handle.db.select().from(settings);
    expect(Object.fromEntries(rows.map((s) => [s.key, s.value]))).toEqual({ whatsapp_number: "0812 1111 2222", default_capacity: 12, qris_reservation_minutes: 45 });
    expect((await audits("SETTINGS_UPDATED"))[0]).toMatchObject({ actorAdminId: ADMIN, oldValue: { qris_reservation_minutes: 30 }, newValue: { qris_reservation_minutes: 45 } });

    const id = await newProduct();
    const o = await placeOrder(checkoutDeps(), { items: [{ productId: id, quantity: 1 }], customerName: "Q", whatsapp: "081234567890", notes: "", pickupDate: "2026-10-03", paymentMethod: "QRIS", paymentOption: "FULL" }, { idempotencyKey: randomUUID(), clientIp: "q" });
    expect(o.ok && o.order.reservationExpiresAt).toBe(new Date(START.getTime() + 45 * 60_000).toISOString());
  });

  it("clearing an optional value removes it (back to empty), not a crash", async () => {
    await updateWebsiteSettings(handle.db, form({ address: "Jl. Contoh 1" }), ADMIN);
    expect(await updateWebsiteSettings(handle.db, form({ address: "" }), ADMIN)).toEqual({ ok: true, changed: ["address"] });
    expect(await handle.db.select().from(settings)).toHaveLength(0);
  });

  it("rejects invalid values without writing anything", async () => {
    const r = await updateWebsiteSettings(handle.db, form({ transfer_reservation_minutes: "10", business_name: "" }), ADMIN);
    expect(r).toMatchObject({ ok: false, fieldErrors: { transfer_reservation_minutes: expect.any(String), business_name: expect.any(String) } });
    expect(await handle.db.select().from(settings)).toHaveLength(0);
  });
});

describe("admin accounts (FD-81–FD-85, §8.1)", () => {
  it("creates admins, refuses duplicates, deactivation revokes sessions, never locks everyone out", async () => {
    const created = await createAdmin(handle.db, { name: "Admin Dua", email: "Dua@Example.test", password: "password-panjang-123", confirmPassword: "password-panjang-123" }, ADMIN);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(await createAdmin(handle.db, { name: "X", email: "dua@example.test", password: "password-panjang-123", confirmPassword: "password-panjang-123" }, ADMIN)).toMatchObject({ ok: false, error: "EMAIL_TAKEN" });
    expect(await createAdmin(handle.db, { name: "X", email: "x@example.test", password: "pendek", confirmPassword: "pendek" }, ADMIN)).toMatchObject({ ok: false, error: "INVALID_INPUT" });

    await handle.db.insert(adminSessions).values({ id: "s1", token: "t1", userId: created.adminId, expiresAt: new Date(Date.now() + 3600_000) });
    expect(await setAdminActive(handle.db, { targetId: created.adminId, active: false, actorAdminId: ADMIN })).toEqual({ ok: true });
    expect(await handle.db.select().from(adminSessions).where(eq(adminSessions.userId, created.adminId))).toHaveLength(0);
    expect(await setAdminActive(handle.db, { targetId: ADMIN, active: false, actorAdminId: ADMIN })).toEqual({ ok: false, error: "SELF" });
    expect(await setAdminActive(handle.db, { targetId: ADMIN, active: false, actorAdminId: created.adminId })).toEqual({ ok: false, error: "LAST_ACTIVE_ADMIN" });

    expect(await resetAdminPassword(handle.db, { targetId: created.adminId, raw: { password: "password-baru-4567", confirmPassword: "password-baru-4567" }, actorAdminId: ADMIN })).toEqual({ ok: true });
    const [acct] = await handle.db.select().from(adminAccounts).where(and(eq(adminAccounts.userId, created.adminId), eq(adminAccounts.providerId, "credential")));
    expect(await verifyPassword(acct!.password!, "password-baru-4567")).toBe(true);
    expect((await audits("ADMIN_PASSWORD_RESET"))[0]).toMatchObject({ actorAdminId: ADMIN, entityId: created.adminId });
    expect(JSON.stringify(await handle.db.select().from(auditLogs))).not.toContain("password-baru-4567");
  });
});

describe("dashboard (FD-90)", () => {
  it("summarizes statuses, attention items, capacity and revenue (exceptions excluded)", async () => {
    const id = await newProduct();
    const place = (pickupDate: string) =>
      placeOrder(checkoutDeps(), { items: [{ productId: id, quantity: 1 }], customerName: "Sari", whatsapp: "081234567890", notes: "", pickupDate, paymentMethod: "CASH", paymentOption: "FULL" }, { idempotencyKey: randomUUID(), clientIp: randomUUID() });
    const a = await place("2026-10-02");
    await place("2026-10-03");
    if (!a.ok) throw new Error("order");
    await markCashPaid(handle.db, { orderId: a.order.orderId, adminId: ADMIN }, clock);

    const d = await getDashboard(handle.db, clock);
    expect(d.byStatus).toMatchObject({ NEW: 2, CONFIRMED: 0, CANCELLED: 0 });
    expect(d.attention.cashUnconfirmed).toHaveLength(2);
    expect(d.upcoming[0]).toMatchObject({ date: "2026-10-02", used: 1, capacity: 10 });
    expect(d.todayOrders.map((o) => o.orderNumber)).toEqual([a.order.orderNumber]);
    expect(d.revenue).toEqual({ receivedTotal: 85_000, receivedThisMonth: 85_000, outstandingTotal: 85_000, outstandingOrders: 1 });
  });
});
