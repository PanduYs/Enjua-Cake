/**
 * Development/E2E only: sample categories and products so public pages can be built
 * and tested before the client supplies real data (GL-02). Every name is prefixed
 * "Contoh" and every image is a generated placeholder.
 *
 *   npm run db:seed-sample               add sample data (idempotent by slug)
 *   npm run db:seed-sample -- --reset    wipe catalog + settings first
 *   npm run db:seed-sample -- --reset --e2e   also add E2E-only fixtures
 */
import path from "node:path";

import { eq, sql } from "drizzle-orm";
import sharp from "sharp";

import { createDatabase, type Database } from "@/server/db/client";
import { categories, productImages, products, settings } from "@/server/db/schema";
import { generateStorageKey } from "@/server/storage/keys";
import { createLocalStorage } from "@/server/storage/local-storage";

type ProductSeed = {
  slug: string;
  name: string;
  category: string;
  price: number;
  salePrice?: number;
  productType: "READY_STOCK" | "PRE_ORDER";
  minimumPreorderDays?: number;
  isFeatured?: boolean;
  soldOut?: boolean;
  isActive?: boolean;
  maxQuantityPerOrder?: number;
  extraImages?: number;
  color: string;
};

const CATEGORIES = [
  { slug: "cakes", name: "Cakes", description: "Contoh deskripsi kategori cake.", sortOrder: 1 },
  { slug: "desserts", name: "Desserts", description: "Contoh deskripsi kategori dessert.", sortOrder: 2 },
  { slug: "cookies", name: "Cookies", description: "Contoh deskripsi kategori cookies.", sortOrder: 3 },
  { slug: "custom-cake", name: "Custom Cake", description: "Kustomisasi lebih lanjut dapat dikonsultasikan via WhatsApp.", sortOrder: 4 },
];

const PRODUCTS: ProductSeed[] = [
  { slug: "contoh-brownies-cokelat", name: "Contoh Brownies Cokelat", category: "cakes", price: 85_000, productType: "READY_STOCK", isFeatured: true, extraImages: 2, color: "#6E4635" },
  { slug: "contoh-cheesecake-stroberi", name: "Contoh Cheesecake Stroberi", category: "cakes", price: 250_000, salePrice: 225_000, productType: "PRE_ORDER", minimumPreorderDays: 2, isFeatured: true, color: "#C98A92" },
  { slug: "contoh-kue-ulang-tahun", name: "Contoh Kue Ulang Tahun", category: "cakes", price: 300_000, productType: "PRE_ORDER", minimumPreorderDays: 3, isFeatured: true, maxQuantityPerOrder: 2, color: "#D8B4A0" },
  { slug: "contoh-pudding-karamel", name: "Contoh Pudding Karamel", category: "desserts", price: 45_000, productType: "READY_STOCK", soldOut: true, isFeatured: true, color: "#C9925B" },
  { slug: "contoh-lapis-legit", name: "Contoh Lapis Legit", category: "desserts", price: 180_000, productType: "PRE_ORDER", minimumPreorderDays: 1, color: "#B98B4E" },
  { slug: "contoh-cookies-butter", name: "Contoh Cookies Butter", category: "cookies", price: 60_000, salePrice: 54_000, productType: "READY_STOCK", maxQuantityPerOrder: 10, color: "#E2C08D" },
  { slug: "contoh-custom-cake", name: "Contoh Custom Cake", category: "custom-cake", price: 450_000, productType: "PRE_ORDER", minimumPreorderDays: 3, color: "#B79A98" },
];

const E2E_PRODUCTS: ProductSeed[] = [
  { slug: "contoh-produk-nonaktif", name: "Contoh Produk Nonaktif", category: "cakes", price: 10_000, productType: "READY_STOCK", isActive: false, isFeatured: true, color: "#999999" },
];

const E2E_SETTINGS: Record<string, unknown> = {
  whatsapp_number: "081234567890",
  address: "Alamat pickup contoh (data E2E)",
  pickup_hours: "Contoh: 10.00–17.00 WIB",
};

async function placeholderImage(color: string): Promise<Uint8Array> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
    <rect width="800" height="800" fill="#F6EADD"/>
    <ellipse cx="400" cy="560" rx="300" ry="70" fill="#E9DDD5"/>
    <rect x="190" y="300" width="420" height="250" rx="40" fill="${color}"/>
    <rect x="190" y="300" width="420" height="70" rx="35" fill="#FFF8F1" opacity="0.85"/>
  </svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer());
}

async function seed(db: Database, storageDir: string, options: { reset: boolean; e2e: boolean }) {
  const storage = createLocalStorage({ baseDir: storageDir, publicBaseUrl: "/storage" });

  if (options.reset) {
    await db.execute(sql`TRUNCATE product_images, products, categories, settings RESTART IDENTITY CASCADE`);
  }

  const categoryIds = new Map<string, string>();
  for (const c of CATEGORIES) {
    const [existing] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, c.slug));
    const id = existing?.id ?? (await db.insert(categories).values(c).returning({ id: categories.id }))[0]!.id;
    categoryIds.set(c.slug, id);
  }

  const seeds = options.e2e ? [...PRODUCTS, ...E2E_PRODUCTS] : PRODUCTS;
  for (const p of seeds) {
    const [existing] = await db.select({ id: products.id }).from(products).where(eq(products.slug, p.slug));
    if (existing) continue;
    const [created] = await db
      .insert(products)
      .values({
        slug: p.slug,
        name: p.name,
        categoryId: categoryIds.get(p.category)!,
        description: `Deskripsi contoh untuk ${p.name}. Akan diganti dengan data produk asli dari klien.`,
        price: p.price,
        salePrice: p.salePrice ?? null,
        productType: p.productType,
        minimumPreorderDays: p.productType === "PRE_ORDER" ? (p.minimumPreorderDays ?? 1) : null,
        isFeatured: p.isFeatured ?? false,
        availability: p.soldOut ? "SOLD_OUT" : "AVAILABLE",
        isActive: p.isActive ?? true,
        maxQuantityPerOrder: p.maxQuantityPerOrder ?? null,
      })
      .returning({ id: products.id });

    for (let i = 0; i <= (p.extraImages ?? 0); i++) {
      const key = generateStorageKey("products", "image/webp");
      await storage.public.put(key, await placeholderImage(i === 0 ? p.color : "#7E5254"), "image/webp");
      await db.insert(productImages).values({
        productId: created!.id,
        storageKey: key,
        altText: i === 0 ? `Foto contoh ${p.name}` : `Foto contoh ${p.name} ${i + 1}`,
        isMain: i === 0,
        sortOrder: i,
      });
    }
  }

  if (options.e2e) {
    for (const [key, value] of Object.entries(E2E_SETTINGS)) {
      await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
    }
  }
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("seed-sample-catalog refuses to run in production.");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required.");
  const args = new Set(process.argv.slice(2));
  const handle = createDatabase(url, { max: 1, silenceNotices: true });
  try {
    await seed(handle.db, path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR ?? ".storage"), {
      reset: args.has("--reset"),
      e2e: args.has("--e2e"),
    });
    console.log("Sample catalog ready.");
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
