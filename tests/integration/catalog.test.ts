import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/server/db/client";
import { categories, productImages, products, settings } from "@/server/db/schema";
import { categoryFallbackImages, getProductBySlug, listActiveCategories, listProducts, type CatalogDeps } from "@/server/services/catalog";
import { getSettings } from "@/server/services/settings";

import { openTestDatabase } from "../support/db";

let handle: DatabaseHandle;
let deps: CatalogDeps;

beforeAll(() => {
  handle = openTestDatabase();
  deps = { db: handle.db, publicBucket: { publicUrl: (key: string) => `/storage/${key}` } };
});
afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.execute(sql`TRUNCATE product_images, products, categories, settings RESTART IDENTITY CASCADE`);
  const [cakes, cookies, hidden] = await handle.db
    .insert(categories)
    .values([
      { name: "Cakes", slug: "cakes", sortOrder: 1 },
      { name: "Cookies", slug: "cookies", sortOrder: 2, imageKey: "categories/cookies.webp" },
      { name: "Hidden", slug: "hidden", sortOrder: 3, isActive: false },
    ])
    .returning({ id: categories.id });

  const inserted = await handle.db
    .insert(products)
    .values([
      { categoryId: cakes!.id, name: "Brownies", slug: "brownies", price: 85_000, productType: "READY_STOCK", isFeatured: true },
      { categoryId: cakes!.id, name: "Cheesecake", slug: "cheesecake", price: 250_000, salePrice: 225_000, productType: "PRE_ORDER", minimumPreorderDays: 2 },
      { categoryId: cakes!.id, name: "Pudding", slug: "pudding", price: 45_000, productType: "READY_STOCK", availability: "SOLD_OUT", isFeatured: true },
      { categoryId: cakes!.id, name: "Nonaktif", slug: "nonaktif", price: 10_000, productType: "READY_STOCK", isActive: false, isFeatured: true },
      { categoryId: cookies!.id, name: "Butter Cookies", slug: "butter-cookies", price: 60_000, productType: "READY_STOCK", maxQuantityPerOrder: 10 },
      { categoryId: hidden!.id, name: "In Hidden Category", slug: "in-hidden", price: 1_000, productType: "READY_STOCK" },
    ])
    .returning({ id: products.id, slug: products.slug });
  const id = (slug: string) => inserted.find((p) => p.slug === slug)!.id;

  await handle.db.insert(productImages).values([
    { productId: id("brownies"), storageKey: "products/b-extra.webp", altText: "Brownies 2", isMain: false, sortOrder: 1 },
    { productId: id("brownies"), storageKey: "products/b-main.webp", altText: "Brownies", isMain: true, sortOrder: 5 },
    { productId: id("cheesecake"), storageKey: "products/c-main.webp", altText: "Cheesecake", isMain: true },
  ]);
});

describe("catalog service", () => {
  it("lists only active products in active categories; Sold Out stays visible (FD-27)", async () => {
    const list = await listProducts(deps);
    expect(list.map((p) => p.slug)).toEqual(["brownies", "cheesecake", "pudding", "butter-cookies"]);
    expect(list.find((p) => p.slug === "pudding")?.soldOut).toBe(true);
  });

  it("filters by category slug and by featured flag (FD-24)", async () => {
    expect((await listProducts(deps, { categorySlug: "cookies" })).map((p) => p.slug)).toEqual(["butter-cookies"]);
    expect((await listProducts(deps, { featuredOnly: true })).map((p) => p.slug)).toEqual(["brownies", "pudding"]);
    expect(await listProducts(deps, { categorySlug: "hidden" })).toEqual([]);
  });

  it("exposes display pricing and Pre-Order lead time", async () => {
    const cheesecake = (await listProducts(deps)).find((p) => p.slug === "cheesecake")!;
    expect(cheesecake.price).toEqual({ effective: 225_000, original: 250_000, discountPercent: 10 });
    expect(cheesecake.productType).toBe("PRE_ORDER");
    expect(cheesecake.minimumPreorderDays).toBe(2);
  });

  it("orders images main-first and resolves public URLs", async () => {
    const detail = await getProductBySlug(deps, "brownies");
    expect(detail?.images.map((i) => i.url)).toEqual(["/storage/products/b-main.webp", "/storage/products/b-extra.webp"]);
    expect(detail?.mainImage?.alt).toBe("Brownies");
  });

  it("returns null for inactive, unknown, or hidden-category products", async () => {
    expect(await getProductBySlug(deps, "nonaktif")).toBeNull();
    expect(await getProductBySlug(deps, "does-not-exist")).toBeNull();
    expect(await getProductBySlug(deps, "in-hidden")).toBeNull();
    expect((await getProductBySlug(deps, "butter-cookies"))?.maxQuantityPerOrder).toBe(10);
  });

  it("lists active categories in sort order with their own image", async () => {
    const list = await listActiveCategories(deps);
    expect(list.map((c) => c.slug)).toEqual(["cakes", "cookies"]);
    expect(list[1]?.image?.url).toBe("/storage/categories/cookies.webp");
  });

  it("falls back to a product main image for categories without their own image", async () => {
    const [cakes] = await listActiveCategories(deps);
    const images = await categoryFallbackImages(deps, [cakes!.id]);
    expect(images.get(cakes!.id)?.url).toBe("/storage/products/b-main.webp");
  });
});

describe("settings service", () => {
  it("reads stored values and defaults the rest", async () => {
    await handle.db.insert(settings).values([
      { key: "business_name", value: "Enjua Cake's" },
      { key: "pickup_cutoff", value: "14:00" },
      { key: "default_capacity", value: "not-a-number" },
    ]);
    const s = await getSettings(handle.db);
    expect(s.pickup_cutoff).toBe("14:00");
    expect(s.default_capacity).toBe(10);
    expect(s.address).toBeNull();
  });
});
