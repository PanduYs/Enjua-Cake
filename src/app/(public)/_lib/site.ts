import "server-only";

import { connection } from "next/server";
import { cache } from "react";

import { buildWhatsAppLink } from "@/lib/whatsapp";
import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { toWibDate } from "@/server/domain/time/wib";
import type { CatalogDeps } from "@/server/services/catalog";
import { getSettings, toPublicSiteSettings, type PublicSiteSettings } from "@/server/services/settings";
import { getStorage } from "@/server/storage";

export interface SiteContext {
  settings: PublicSiteSettings;
  whatsAppHref: string | null;
  catalog: CatalogDeps;
  currentYear: number;
}

/**
 * Per-request site data shared by the public layout and pages. Rendering is
 * dynamic for now; tag-based caching is added with admin editing (Phase 6).
 */
export const loadSite = cache(async (): Promise<SiteContext> => {
  await connection();
  const db = getDb();
  const settings = toPublicSiteSettings(await getSettings(db));
  return {
    settings,
    whatsAppHref: settings.whatsapp_number
      ? buildWhatsAppLink(settings.whatsapp_number, { kind: "general" }, settings.business_name)
      : null,
    catalog: { db, publicBucket: getStorage().public },
    currentYear: Number(toWibDate(systemClock.now()).slice(0, 4)),
  };
});
