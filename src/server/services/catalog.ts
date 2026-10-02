import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { categories, productImages, products } from "@/server/db/schema";
import { displayPrice, type DisplayPrice } from "@/server/domain/catalog/pricing";
import type { PublicBucket } from "@/server/storage/types";

export interface CatalogImage {
  url: string;
  alt: string;
}

export interface CatalogCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: CatalogImage | null;
}

export interface CatalogProductSummary {
  id: string;
  slug: string;
  name: string;
  category: { name: string; slug: string };
  productType: "READY_STOCK" | "PRE_ORDER";
  minimumPreorderDays: number | null;
  soldOut: boolean;
  isFeatured: boolean;
  maxQuantityPerOrder: number | null;
  price: DisplayPrice;
  mainImage: CatalogImage | null;
}

export interface CatalogProductDetail extends CatalogProductSummary {
  description: string;
  images: CatalogImage[];
}

export interface CatalogDeps {
  db: Database;
  publicBucket: Pick<PublicBucket, "publicUrl">;
}

const productColumns = {
  id: products.id,
  slug: products.slug,
  name: products.name,
  description: products.description,
  price: products.price,
  salePrice: products.salePrice,
  productType: products.productType,
  minimumPreorderDays: products.minimumPreorderDays,
  availability: products.availability,
  isFeatured: products.isFeatured,
  maxQuantityPerOrder: products.maxQuantityPerOrder,
  categoryName: categories.name,
  categorySlug: categories.slug,
};

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  salePrice: number | null;
  productType: "READY_STOCK" | "PRE_ORDER";
  minimumPreorderDays: number | null;
  availability: "AVAILABLE" | "SOLD_OUT";
  isFeatured: boolean;
  maxQuantityPerOrder: number | null;
  categoryName: string;
  categorySlug: string;
};

/** Images ordered main-first, then sort order. */
async function imagesByProduct(deps: CatalogDeps, productIds: string[]): Promise<Map<string, CatalogImage[]>> {
  const map = new Map<string, CatalogImage[]>();
  if (productIds.length === 0) return map;
  const rows = await deps.db
    .select({ productId: productImages.productId, key: productImages.storageKey, alt: productImages.altText })
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(desc(productImages.isMain), asc(productImages.sortOrder), asc(productImages.createdAt));
  for (const row of rows) {
    const list = map.get(row.productId) ?? [];
    list.push({ url: deps.publicBucket.publicUrl(row.key), alt: row.alt });
    map.set(row.productId, list);
  }
  return map;
}

function toSummary(row: ProductRow, images: CatalogImage[]): CatalogProductSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: { name: row.categoryName, slug: row.categorySlug },
    productType: row.productType,
    minimumPreorderDays: row.minimumPreorderDays,
    soldOut: row.availability === "SOLD_OUT",
    isFeatured: row.isFeatured,
    maxQuantityPerOrder: row.maxQuantityPerOrder,
    price: displayPrice({ price: row.price, salePrice: row.salePrice }),
    mainImage: images[0] ?? null,
  };
}

/** Active categories for navigation/filter and homepage cards (FD-23). */
export async function listActiveCategories(deps: CatalogDeps): Promise<CatalogCategory[]> {
  const rows = await deps.db
    .select({ id: categories.id, name: categories.name, slug: categories.slug, description: categories.description, imageKey: categories.imageKey })
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    image: r.imageKey ? { url: deps.publicBucket.publicUrl(r.imageKey), alt: r.name } : null,
  }));
}

/**
 * Visible products: active only (FD-27). Sold Out products stay visible.
 * Optional filters: category slug, featured only.
 */
export async function listProducts(
  deps: CatalogDeps,
  filters: { categorySlug?: string; featuredOnly?: boolean; limit?: number } = {},
): Promise<CatalogProductSummary[]> {
  const conditions = [eq(products.isActive, true), eq(categories.isActive, true)];
  if (filters.categorySlug) conditions.push(eq(categories.slug, filters.categorySlug));
  if (filters.featuredOnly) conditions.push(eq(products.isFeatured, true));

  const query = deps.db
    .select(productColumns)
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(asc(categories.sortOrder), asc(categories.name), asc(products.name));
  const rows: ProductRow[] = filters.limit ? await query.limit(filters.limit) : await query;

  const images = await imagesByProduct(deps, rows.map((r) => r.id));
  return rows.map((row) => toSummary(row, images.get(row.id) ?? []));
}

/** Product detail by slug; null when not found, inactive, or in an inactive category. */
export async function getProductBySlug(deps: CatalogDeps, slug: string): Promise<CatalogProductDetail | null> {
  const [row] = await deps.db
    .select(productColumns)
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.slug, slug), eq(products.isActive, true), eq(categories.isActive, true)))
    .limit(1);
  if (!row) return null;
  const images = (await imagesByProduct(deps, [row.id])).get(row.id) ?? [];
  return {
    ...toSummary(row, images),
    description: row.description,
    images,
  };
}

/** First image per category from its products, used when a category has no own image. */
export async function categoryFallbackImages(deps: CatalogDeps, categoryIds: string[]): Promise<Map<string, CatalogImage>> {
  const result = new Map<string, CatalogImage>();
  if (categoryIds.length === 0) return result;
  const rows = await deps.db
    .select({ categoryId: products.categoryId, key: productImages.storageKey, alt: productImages.altText })
    .from(productImages)
    .innerJoin(products, eq(productImages.productId, products.id))
    .where(and(inArray(products.categoryId, categoryIds), eq(products.isActive, true), eq(productImages.isMain, true)))
    .orderBy(desc(products.isFeatured), asc(products.name));
  for (const row of rows) {
    if (!result.has(row.categoryId)) result.set(row.categoryId, { url: deps.publicBucket.publicUrl(row.key), alt: row.alt });
  }
  return result;
}
