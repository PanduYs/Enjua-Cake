import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { productAvailabilityEnum, productTypeEnum } from "./enums";

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  imageKey: text("image_key"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description").notNull().default(""),
    /** Integer Rupiah (FD-43). */
    price: integer("price").notNull(),
    salePrice: integer("sale_price"),
    productType: productTypeEnum("product_type").notNull(),
    minimumPreorderDays: integer("minimum_preorder_days"),
    isFeatured: boolean("is_featured").notNull().default(false),
    availability: productAvailabilityEnum("availability").notNull().default("AVAILABLE"),
    isActive: boolean("is_active").notNull().default(true),
    maxQuantityPerOrder: integer("max_quantity_per_order"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("products_category_id_idx").on(t.categoryId),
    check("products_price_non_negative", sql`${t.price} >= 0`),
    check("products_sale_price_valid", sql`${t.salePrice} IS NULL OR (${t.salePrice} >= 0 AND ${t.salePrice} < ${t.price})`),
    check(
      "products_preorder_days_valid",
      // IS NOT NULL is explicit: a NULL comparison would make the CHECK pass silently.
      sql`(${t.productType} = 'PRE_ORDER' AND ${t.minimumPreorderDays} IS NOT NULL AND ${t.minimumPreorderDays} >= 1) OR (${t.productType} = 'READY_STOCK' AND ${t.minimumPreorderDays} IS NULL)`,
    ),
    check("products_max_qty_positive", sql`${t.maxQuantityPerOrder} IS NULL OR ${t.maxQuantityPerOrder} > 0`),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    altText: text("alt_text").notNull(),
    isMain: boolean("is_main").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("product_images_product_id_idx").on(t.productId),
    // Exactly one main image per product is enforced as "at most one" here; "at least one" is a service rule.
    uniqueIndex("product_images_one_main_per_product").on(t.productId).where(sql`${t.isMain} = true`),
  ],
);
