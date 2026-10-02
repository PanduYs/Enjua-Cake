import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/server/db/client";
import { categories, productImages, products } from "@/server/db/schema";

import { openTestDatabase } from "../support/db";

let handle: DatabaseHandle;
let categoryId: string;

beforeAll(() => {
  handle = openTestDatabase();
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  await handle.db.execute(sql`TRUNCATE product_images, products, categories RESTART IDENTITY CASCADE`);
  const [category] = await handle.db.insert(categories).values({ name: "Cakes", slug: "cakes" }).returning({ id: categories.id });
  categoryId = category!.id;
});

const base = () => ({ categoryId, name: "Brownies", slug: `brownies-${Math.random().toString(36).slice(2)}`, price: 50_000 });

/** Drizzle wraps driver errors; the PostgreSQL constraint name lives on the cause. */
async function expectConstraint(promise: Promise<unknown>, constraint: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `expected violation of ${constraint}`).not.toBeNull();
  const cause = (error as { cause?: { constraint_name?: string } }).cause;
  expect(cause?.constraint_name).toBe(constraint);
}

describe("database constraints mirror business rules", () => {
  it("accepts a valid Ready Stock and a valid Pre-Order product", async () => {
    await handle.db.insert(products).values({ ...base(), productType: "READY_STOCK" });
    await handle.db.insert(products).values({ ...base(), productType: "PRE_ORDER", minimumPreorderDays: 3, salePrice: 45_000 });
  });

  it("requires minimum_preorder_days >= 1 for Pre-Order and null for Ready Stock (FD-16)", async () => {
    await expectConstraint(handle.db.insert(products).values({ ...base(), productType: "PRE_ORDER" }), "products_preorder_days_valid");
    await expectConstraint(
      handle.db.insert(products).values({ ...base(), productType: "PRE_ORDER", minimumPreorderDays: 0 }),
      "products_preorder_days_valid",
    );
    await expectConstraint(
      handle.db.insert(products).values({ ...base(), productType: "READY_STOCK", minimumPreorderDays: 1 }),
      "products_preorder_days_valid",
    );
  });

  it("requires sale_price to be below price (FD-25)", async () => {
    await expectConstraint(
      handle.db.insert(products).values({ ...base(), productType: "READY_STOCK", salePrice: 50_000 }),
      "products_sale_price_valid",
    );
  });

  it("requires max_quantity_per_order to be positive when set (FD-28)", async () => {
    await expectConstraint(
      handle.db.insert(products).values({ ...base(), productType: "READY_STOCK", maxQuantityPerOrder: 0 }),
      "products_max_qty_positive",
    );
  });

  it("allows at most one main image per product", async () => {
    const [product] = await handle.db
      .insert(products)
      .values({ ...base(), productType: "READY_STOCK" })
      .returning({ id: products.id });
    const image = { productId: product!.id, altText: "Brownies", isMain: true };
    await handle.db.insert(productImages).values({ ...image, storageKey: "products/a.jpg" });
    await expectConstraint(
      handle.db.insert(productImages).values({ ...image, storageKey: "products/b.jpg" }),
      "product_images_one_main_per_product",
    );
    await handle.db.insert(productImages).values({ ...image, isMain: false, storageKey: "products/c.jpg" });
  });
});
