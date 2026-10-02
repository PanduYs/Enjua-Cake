import "server-only";

import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import sharp from "sharp";

import { altTextSchema, categoryFormSchema, fieldErrorsOf, productFormSchema, slugify } from "@/lib/validation/admin-catalog";
import type { Database } from "@/server/db/client";
import { categories, orderItems, productImages, products } from "@/server/db/schema";
import { writeAudit } from "@/server/observability/audit";
import { generateStorageKey } from "@/server/storage/keys";
import type { PublicBucket } from "@/server/storage/types";

export interface CatalogAdminDeps {
  db: Database;
  publicBucket: Pick<PublicBucket, "put" | "delete" | "publicUrl">;
}

type Fail = { ok: false; error: string; fieldErrors?: Partial<Record<string, string>> };
type Ok<T = object> = { ok: true } & T;

/** Product photos (§24): JPEG/PNG/WebP by magic bytes, ≤ 8 MB in, stored as WebP ≤ 1600 px. */
export const PRODUCT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_MAX_EDGE = 1600;

export function detectImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export const IMAGE_ERROR = {
  EMPTY: "Pilih file foto.",
  TOO_LARGE: "Ukuran foto maksimal 8 MB.",
  UNSUPPORTED_TYPE: "Format foto harus JPG, PNG, atau WebP.",
  UNREADABLE: "Foto tidak dapat dibaca. Coba file lain.",
} as const;

/** Validates, re-encodes (drops metadata/EXIF), and stores an image; returns its key. */
async function storeImage(bucket: CatalogAdminDeps["publicBucket"], prefix: string, bytes: Uint8Array): Promise<{ ok: true; key: string } | { ok: false; error: keyof typeof IMAGE_ERROR }> {
  if (bytes.byteLength === 0) return { ok: false, error: "EMPTY" };
  if (bytes.byteLength > PRODUCT_IMAGE_MAX_BYTES) return { ok: false, error: "TOO_LARGE" };
  if (!detectImageType(bytes)) return { ok: false, error: "UNSUPPORTED_TYPE" };
  let webp: Buffer;
  try {
    webp = await sharp(bytes, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: IMAGE_MAX_EDGE, height: IMAGE_MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return { ok: false, error: "UNREADABLE" };
  }
  const key = generateStorageKey(prefix, "image/webp");
  await bucket.put(key, new Uint8Array(webp), "image/webp");
  return { ok: true, key };
}

type Executor = Pick<Database, "select">;

/** Auto slug from the name, unique; an explicit slug must be unique as-is. */
async function resolveSlug(db: Executor, table: typeof products | typeof categories, explicit: string, name: string, selfId?: string): Promise<{ ok: true; slug: string } | Fail> {
  const taken = async (slug: string) => {
    const rows = await db
      .select({ id: table.id })
      .from(table)
      .where(selfId ? and(eq(table.slug, slug), ne(table.id, selfId)) : eq(table.slug, slug))
      .limit(1);
    return rows.length > 0;
  };
  if (explicit) {
    return (await taken(explicit)) ? { ok: false, error: "SLUG_TAKEN", fieldErrors: { slug: "Slug sudah dipakai." } } : { ok: true, slug: explicit };
  }
  const base = slugify(name) || "item";
  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    if (!(await taken(candidate))) return { ok: true, slug: candidate };
  }
  return { ok: false, error: "SLUG_TAKEN", fieldErrors: { slug: "Tidak dapat membuat slug unik. Isi slug manual." } };
}

// ---------- Products ----------

export async function listAdminProducts(deps: CatalogAdminDeps) {
  const rows = await deps.db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      price: products.price,
      salePrice: products.salePrice,
      productType: products.productType,
      availability: products.availability,
      isActive: products.isActive,
      isFeatured: products.isFeatured,
      categoryName: categories.name,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .orderBy(asc(categories.sortOrder), asc(categories.name), asc(products.name));
  const mains = rows.length
    ? await deps.db
        .select({ productId: productImages.productId, key: productImages.storageKey, alt: productImages.altText })
        .from(productImages)
        .where(and(inArray(productImages.productId, rows.map((r) => r.id)), eq(productImages.isMain, true)))
    : [];
  const mainBy = new Map(mains.map((m) => [m.productId, { url: deps.publicBucket.publicUrl(m.key), alt: m.alt }]));
  return rows.map((r) => ({ ...r, mainImage: mainBy.get(r.id) ?? null }));
}

export async function getAdminProduct(deps: CatalogAdminDeps, id: string) {
  const [product] = await deps.db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) return null;
  const images = await deps.db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, id))
    .orderBy(desc(productImages.isMain), asc(productImages.sortOrder), asc(productImages.createdAt));
  const [{ orders: orderCount }] = (await deps.db.select({ orders: count() }).from(orderItems).where(eq(orderItems.productId, id))) as [{ orders: number }];
  return { product, images: images.map((i) => ({ ...i, url: deps.publicBucket.publicUrl(i.storageKey) })), orderCount };
}

function productValues(v: ReturnType<typeof productFormSchema.parse>) {
  return {
    name: v.name,
    description: v.description,
    categoryId: v.categoryId,
    price: v.price,
    salePrice: v.salePrice,
    productType: v.productType,
    minimumPreorderDays: v.minimumPreorderDays,
    isFeatured: v.isFeatured,
    availability: v.availability,
    isActive: v.isActive,
    maxQuantityPerOrder: v.maxQuantityPerOrder,
  };
}

async function categoryExists(db: Executor, id: string) {
  return (await db.select({ id: categories.id }).from(categories).where(eq(categories.id, id)).limit(1)).length > 0;
}

/** New product with exactly one main photo (FD-22). */
export async function createProduct(
  deps: CatalogAdminDeps,
  args: { input: Record<string, unknown>; mainImage: Uint8Array; mainImageAlt: unknown; adminId: string },
): Promise<Ok<{ productId: string }> | Fail> {
  const parsed = productFormSchema.safeParse(args.input);
  const alt = altTextSchema.safeParse(args.mainImageAlt);
  if (!parsed.success || !alt.success) {
    return { ok: false, error: "INVALID_INPUT", fieldErrors: { ...(parsed.success ? {} : fieldErrorsOf(parsed.error)), ...(alt.success ? {} : { mainImageAlt: alt.error.issues[0]!.message }) } };
  }
  if (!(await categoryExists(deps.db, parsed.data.categoryId))) return { ok: false, error: "INVALID_INPUT", fieldErrors: { categoryId: "Pilih kategori." } };
  const slug = await resolveSlug(deps.db, products, parsed.data.slug, parsed.data.name);
  if (!slug.ok) return slug;

  const stored = await storeImage(deps.publicBucket, "products", args.mainImage);
  if (!stored.ok) return { ok: false, error: "INVALID_INPUT", fieldErrors: { mainImage: IMAGE_ERROR[stored.error] } };

  try {
    const productId = await deps.db.transaction(async (tx) => {
      const [row] = await tx.insert(products).values({ ...productValues(parsed.data), slug: slug.slug }).returning({ id: products.id });
      await tx.insert(productImages).values({ productId: row!.id, storageKey: stored.key, altText: alt.data, isMain: true, sortOrder: 0 });
      await writeAudit(tx, {
        entityType: "product",
        entityId: row!.id,
        eventType: "PRODUCT_CREATED",
        newValue: { ...productValues(parsed.data), slug: slug.slug },
        actor: { type: "ADMIN", adminId: args.adminId },
      });
      return row!.id;
    });
    return { ok: true, productId };
  } catch (error) {
    await deps.publicBucket.delete(stored.key).catch(() => undefined);
    throw error;
  }
}

export async function updateProduct(deps: CatalogAdminDeps, args: { productId: string; input: Record<string, unknown>; adminId: string }): Promise<Ok | Fail> {
  const parsed = productFormSchema.safeParse(args.input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT", fieldErrors: fieldErrorsOf(parsed.error) };
  const [before] = await deps.db.select().from(products).where(eq(products.id, args.productId)).limit(1);
  if (!before) return { ok: false, error: "NOT_FOUND" };
  if (!(await categoryExists(deps.db, parsed.data.categoryId))) return { ok: false, error: "INVALID_INPUT", fieldErrors: { categoryId: "Pilih kategori." } };
  const slug = await resolveSlug(deps.db, products, parsed.data.slug || before.slug, parsed.data.name, args.productId);
  if (!slug.ok) return slug;

  const next = { ...productValues(parsed.data), slug: slug.slug };
  const changedKeys = (Object.keys(next) as Array<keyof typeof next>).filter((k) => before[k] !== next[k]);
  if (changedKeys.length === 0) return { ok: true };
  await deps.db.transaction(async (tx) => {
    await tx
      .update(products)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(products.id, args.productId));
    await writeAudit(tx, {
      entityType: "product",
      entityId: args.productId,
      eventType: "PRODUCT_UPDATED",
      oldValue: Object.fromEntries(changedKeys.map((k) => [k, before[k]])),
      newValue: Object.fromEntries(changedKeys.map((k) => [k, next[k]])),
      actor: { type: "ADMIN", adminId: args.adminId },
    });
  });
  return { ok: true };
}

/**
 * Hard delete only for products never ordered; otherwise the admin deactivates it
 * so order history keeps working (PRD §31.1).
 */
export async function deleteProduct(deps: CatalogAdminDeps, args: { productId: string; adminId: string }): Promise<Ok | Fail> {
  const keys: string[] = [];
  const result = await deps.db.transaction(async (tx) => {
    const [product] = await tx.select().from(products).where(eq(products.id, args.productId)).for("update");
    if (!product) return { ok: false, error: "NOT_FOUND" } as const;
    const [used] = await tx.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.productId, args.productId)).limit(1);
    if (used) return { ok: false, error: "HAS_ORDERS" } as const;
    const images = await tx.select({ key: productImages.storageKey }).from(productImages).where(eq(productImages.productId, args.productId));
    keys.push(...images.map((i) => i.key));
    await tx.delete(products).where(eq(products.id, args.productId)); // images cascade
    await writeAudit(tx, {
      entityType: "product",
      entityId: args.productId,
      eventType: "PRODUCT_DELETED",
      oldValue: { name: product.name, slug: product.slug },
      actor: { type: "ADMIN", adminId: args.adminId },
    });
    return { ok: true } as const;
  });
  if (result.ok) for (const key of keys) await deps.publicBucket.delete(key).catch(() => undefined);
  return result;
}

export async function addProductImage(
  deps: CatalogAdminDeps,
  args: { productId: string; bytes: Uint8Array; altText: unknown; makeMain: boolean; adminId: string },
): Promise<Ok | Fail> {
  const alt = altTextSchema.safeParse(args.altText);
  if (!alt.success) return { ok: false, error: "INVALID_INPUT", fieldErrors: { altText: alt.error.issues[0]!.message } };
  const [product] = await deps.db.select({ id: products.id }).from(products).where(eq(products.id, args.productId)).limit(1);
  if (!product) return { ok: false, error: "NOT_FOUND" };
  const stored = await storeImage(deps.publicBucket, "products", args.bytes);
  if (!stored.ok) return { ok: false, error: "INVALID_INPUT", fieldErrors: { image: IMAGE_ERROR[stored.error] } };
  try {
    await deps.db.transaction(async (tx) => {
      await tx.select({ id: products.id }).from(products).where(eq(products.id, args.productId)).for("update");
      const [{ maxSort }] = (await tx
        .select({ maxSort: sql<number>`coalesce(max(${productImages.sortOrder}), -1)::int` })
        .from(productImages)
        .where(eq(productImages.productId, args.productId))) as [{ maxSort: number }];
      const [{ mains }] = (await tx.select({ mains: count() }).from(productImages).where(and(eq(productImages.productId, args.productId), eq(productImages.isMain, true)))) as [{ mains: number }];
      const isMain = args.makeMain || mains === 0;
      if (isMain) await tx.update(productImages).set({ isMain: false }).where(eq(productImages.productId, args.productId));
      const [img] = await tx
        .insert(productImages)
        .values({ productId: args.productId, storageKey: stored.key, altText: alt.data, isMain, sortOrder: maxSort + 1 })
        .returning({ id: productImages.id });
      await writeAudit(tx, {
        entityType: "product",
        entityId: args.productId,
        eventType: "PRODUCT_IMAGE_ADDED",
        newValue: { imageId: img!.id, isMain },
        actor: { type: "ADMIN", adminId: args.adminId },
      });
    });
    return { ok: true };
  } catch (error) {
    await deps.publicBucket.delete(stored.key).catch(() => undefined);
    throw error;
  }
}

export async function setMainProductImage(deps: CatalogAdminDeps, args: { imageId: string; adminId: string }): Promise<Ok | Fail> {
  return deps.db.transaction(async (tx) => {
    const [img] = await tx.select().from(productImages).where(eq(productImages.id, args.imageId)).limit(1);
    if (!img) return { ok: false, error: "NOT_FOUND" } as const;
    await tx.select({ id: products.id }).from(products).where(eq(products.id, img.productId)).for("update");
    await tx.update(productImages).set({ isMain: false }).where(eq(productImages.productId, img.productId));
    await tx.update(productImages).set({ isMain: true }).where(eq(productImages.id, img.id));
    await writeAudit(tx, { entityType: "product", entityId: img.productId, eventType: "PRODUCT_MAIN_IMAGE_CHANGED", newValue: { imageId: img.id }, actor: { type: "ADMIN", adminId: args.adminId } });
    return { ok: true } as const;
  });
}

export async function updateProductImageAlt(deps: CatalogAdminDeps, args: { imageId: string; altText: unknown; adminId: string }): Promise<Ok | Fail> {
  const alt = altTextSchema.safeParse(args.altText);
  if (!alt.success) return { ok: false, error: "INVALID_INPUT", fieldErrors: { altText: alt.error.issues[0]!.message } };
  const [img] = await deps.db.update(productImages).set({ altText: alt.data }).where(eq(productImages.id, args.imageId)).returning({ productId: productImages.productId });
  if (!img) return { ok: false, error: "NOT_FOUND" };
  await writeAudit(deps.db, { entityType: "product", entityId: img.productId, eventType: "PRODUCT_IMAGE_UPDATED", newValue: { imageId: args.imageId }, actor: { type: "ADMIN", adminId: args.adminId } });
  return { ok: true };
}

/** The main photo can be removed only when another photo takes its place (exactly one main, FD-22). */
export async function deleteProductImage(deps: CatalogAdminDeps, args: { imageId: string; adminId: string }): Promise<Ok | Fail> {
  let removedKey: string | null = null;
  const result = await deps.db.transaction(async (tx) => {
    const [img] = await tx.select().from(productImages).where(eq(productImages.id, args.imageId)).limit(1);
    if (!img) return { ok: false, error: "NOT_FOUND" } as const;
    await tx.select({ id: products.id }).from(products).where(eq(products.id, img.productId)).for("update");
    if (img.isMain) {
      const [next] = await tx
        .select({ id: productImages.id })
        .from(productImages)
        .where(and(eq(productImages.productId, img.productId), ne(productImages.id, img.id)))
        .orderBy(asc(productImages.sortOrder))
        .limit(1);
      if (!next) return { ok: false, error: "LAST_IMAGE" } as const;
      await tx.delete(productImages).where(eq(productImages.id, img.id));
      await tx.update(productImages).set({ isMain: true }).where(eq(productImages.id, next.id));
    } else {
      await tx.delete(productImages).where(eq(productImages.id, img.id));
    }
    removedKey = img.storageKey;
    await writeAudit(tx, { entityType: "product", entityId: img.productId, eventType: "PRODUCT_IMAGE_REMOVED", oldValue: { imageId: img.id, wasMain: img.isMain }, actor: { type: "ADMIN", adminId: args.adminId } });
    return { ok: true } as const;
  });
  if (result.ok && removedKey) await deps.publicBucket.delete(removedKey).catch(() => undefined);
  return result;
}

// ---------- Categories ----------

export async function listAdminCategories(deps: CatalogAdminDeps) {
  const rows = await deps.db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      sortOrder: categories.sortOrder,
      isActive: categories.isActive,
      imageKey: categories.imageKey,
      productCount: sql<number>`(select count(*)::int from ${products} where ${products.categoryId} = ${categories.id})`,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  return rows.map((r) => ({ ...r, imageUrl: r.imageKey ? deps.publicBucket.publicUrl(r.imageKey) : null }));
}

export async function saveCategory(
  deps: CatalogAdminDeps,
  args: { categoryId?: string; input: Record<string, unknown>; image?: Uint8Array | null; adminId: string },
): Promise<Ok<{ categoryId: string }> | Fail> {
  const parsed = categoryFormSchema.safeParse(args.input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT", fieldErrors: fieldErrorsOf(parsed.error) };
  const [before] = args.categoryId ? await deps.db.select().from(categories).where(eq(categories.id, args.categoryId)).limit(1) : [undefined];
  if (args.categoryId && !before) return { ok: false, error: "NOT_FOUND" };
  const slug = await resolveSlug(deps.db, categories, parsed.data.slug || before?.slug || "", parsed.data.name, args.categoryId);
  if (!slug.ok) return slug;

  let imageKey = before?.imageKey ?? null;
  if (args.image && args.image.byteLength > 0) {
    const stored = await storeImage(deps.publicBucket, "categories", args.image);
    if (!stored.ok) return { ok: false, error: "INVALID_INPUT", fieldErrors: { image: IMAGE_ERROR[stored.error] } };
    imageKey = stored.key;
  }
  const values = { name: parsed.data.name, slug: slug.slug, description: parsed.data.description, sortOrder: parsed.data.sortOrder, isActive: parsed.data.isActive, imageKey };
  const categoryId = await deps.db.transaction(async (tx) => {
    let id = args.categoryId;
    if (id) await tx.update(categories).set({ ...values, updatedAt: new Date() }).where(eq(categories.id, id));
    else id = (await tx.insert(categories).values(values).returning({ id: categories.id }))[0]!.id;
    await writeAudit(tx, {
      entityType: "category",
      entityId: id,
      eventType: before ? "CATEGORY_UPDATED" : "CATEGORY_CREATED",
      oldValue: before ? { name: before.name, slug: before.slug, isActive: before.isActive, sortOrder: before.sortOrder } : null,
      newValue: { name: values.name, slug: values.slug, isActive: values.isActive, sortOrder: values.sortOrder, imageChanged: imageKey !== (before?.imageKey ?? null) },
      actor: { type: "ADMIN", adminId: args.adminId },
    });
    return id;
  });
  if (before?.imageKey && before.imageKey !== imageKey) await deps.publicBucket.delete(before.imageKey).catch(() => undefined);
  return { ok: true, categoryId };
}

/** Only empty categories can be deleted; otherwise deactivate (keeps products and history intact). */
export async function deleteCategory(deps: CatalogAdminDeps, args: { categoryId: string; adminId: string }): Promise<Ok | Fail> {
  let imageKey: string | null = null;
  const result = await deps.db.transaction(async (tx) => {
    const [cat] = await tx.select().from(categories).where(eq(categories.id, args.categoryId)).for("update");
    if (!cat) return { ok: false, error: "NOT_FOUND" } as const;
    const [p] = await tx.select({ id: products.id }).from(products).where(eq(products.categoryId, args.categoryId)).limit(1);
    if (p) return { ok: false, error: "HAS_PRODUCTS" } as const;
    await tx.delete(categories).where(eq(categories.id, args.categoryId));
    imageKey = cat.imageKey;
    await writeAudit(tx, { entityType: "category", entityId: cat.id, eventType: "CATEGORY_DELETED", oldValue: { name: cat.name, slug: cat.slug }, actor: { type: "ADMIN", adminId: args.adminId } });
    return { ok: true } as const;
  });
  if (result.ok && imageKey) await deps.publicBucket.delete(imageKey).catch(() => undefined);
  return result;
}
