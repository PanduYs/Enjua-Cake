import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { listActiveCategories, listProducts } from "@/server/services/catalog";
import { getStorage } from "@/server/storage";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = getEnv().APP_URL.replace(/\/$/, "");
  const deps = { db: getDb(), publicBucket: getStorage().public };
  const [products, categories] = await Promise.all([listProducts(deps), listActiveCategories(deps)]);
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/produk`, changeFrequency: "daily", priority: 0.9 },
    ...categories.map((c) => ({ url: `${base}/produk?kategori=${encodeURIComponent(c.slug)}`, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...products.map((p) => ({ url: `${base}/produk/${p.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
