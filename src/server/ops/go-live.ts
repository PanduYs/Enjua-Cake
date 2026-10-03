import "server-only";

import { and, count, eq, like, or } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { admins, categories, products } from "@/server/db/schema";
import { getSettings } from "@/server/services/settings";

/**
 * Go-live data checklist (FINAL-REQUIREMENT-DECISIONS GL-01…GL-12, FD-88, FD-99).
 * Reports what is missing or still sample data; it never fills anything in.
 */
export type GoLiveStatus = "OK" | "MISSING" | "SAMPLE_DATA" | "MANUAL";
export interface GoLiveItem {
  id: string;
  label: string;
  status: GoLiveStatus;
  note?: string;
}

export async function goLiveChecklist(db: Database): Promise<GoLiveItem[]> {
  const s = await getSettings(db);
  const [[activeProducts], [sampleProducts], [activeCategories], [testAdmins]] = await Promise.all([
    db.select({ n: count() }).from(products).where(eq(products.isActive, true)),
    db
      .select({ n: count() })
      .from(products)
      .where(or(like(products.slug, "contoh-%"), like(products.description, "Deskripsi contoh%"))),
    db.select({ n: count() }).from(categories).where(eq(categories.isActive, true)),
    db
      .select({ n: count() })
      .from(admins)
      .where(and(eq(admins.isActive, true), or(like(admins.email, "%@example.test"), like(admins.email, "%@example.com")))),
  ]);
  const has = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && String(v).trim() !== "");
  const item = (id: string, label: string, ok: boolean, note?: string): GoLiveItem => ({ id, label, status: ok ? "OK" : "MISSING", ...(note ? { note } : {}) });

  return [
    { id: "GL-01", label: "Logo final & aset brand", status: "MANUAL", note: "Periksa header/footer/ikon secara visual." },
    {
      id: "GL-02",
      label: "Produk & foto asli",
      status: sampleProducts!.n > 0 ? "SAMPLE_DATA" : activeProducts!.n > 0 && activeCategories!.n > 0 ? "OK" : "MISSING",
      note: `${activeProducts!.n} produk aktif, ${activeCategories!.n} kategori aktif, ${sampleProducts!.n} produk contoh`,
    },
    item("GL-03", "Alamat pickup", has(s.address)),
    item("GL-04", "Nomor WhatsApp", has(s.whatsapp_number)),
    item("GL-05", "Rekening bank", has(s.bank_accounts), has(s.bank_accounts) ? `${s.bank_accounts.length} rekening` : "Transfer Bank tidak dapat dibayar tanpa rekening"),
    item("GL-06", "Akun media sosial", has(s.social_links)),
    item("GL-07", "Jam operasional & jam pickup", has(s.operating_hours) && has(s.pickup_hours)),
    { id: "GL-08", label: "Pickup cutoff final", status: "MANUAL", note: `Saat ini ${String(s.pickup_cutoff)} WIB — konfirmasi ke klien` },
    { id: "GL-09", label: "Kebijakan pembatalan & refund", status: "MANUAL", note: "Keputusan klien (FD-61); tidak dapat dicek otomatis" },
    { id: "GL-10", label: "Merchant payment gateway production", status: "MANUAL", note: "Cek dengan `npm run preflight -- --target=production`" },
    // Optional: only required if the client wants the links in the footer (FD-97).
    { id: "GL-11", label: "Privacy Policy / Terms (tautan footer)", status: has(s.policy_links) ? "OK" : "MANUAL", note: has(s.policy_links) ? undefined : "Belum ada tautan — wajib hanya bila ditampilkan" },
    { id: "GL-12", label: "Copy marketing disetujui", status: "MANUAL", note: "src/lib/copy/public.ts masih placeholder" },
    {
      id: "ADMIN",
      label: "Akun admin uji/seed dinonaktifkan",
      status: testAdmins!.n > 0 ? "SAMPLE_DATA" : "OK",
      ...(testAdmins!.n > 0 ? { note: `${testAdmins!.n} akun @example.* masih aktif` } : {}),
    },
  ];
}
