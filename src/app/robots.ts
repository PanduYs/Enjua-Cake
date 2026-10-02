import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { getEnv } from "@/server/env";

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  const base = getEnv().APP_URL.replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/keranjang", "/checkout", "/lacak"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
