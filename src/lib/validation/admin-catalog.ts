import { z } from "zod";

/** Admin product/category forms (PRD §31, FD-22–FD-30). Values arrive as form strings. */
export const PRODUCT_NAME_MAX = 120;
export const PRODUCT_DESCRIPTION_MAX = 4000;
export const SLUG_MAX = 80;
export const ALT_TEXT_MAX = 200;
/** Technical ceiling so price × quantity stays within PostgreSQL integer (TD-19). */
export const PRICE_MAX = 100_000_000;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "Kue Ulang Tahun Spesial!" → "kue-ulang-tahun-spesial" */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

const optionalInt = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const digits = v.replace(/[.\s]/g, "");
      if (!/^\d+$/.test(digits)) {
        ctx.addIssue({ code: "custom", message: `${label} harus berupa angka bulat.` });
        return z.NEVER;
      }
      const n = Number(digits);
      if (n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `${label} harus antara ${min.toLocaleString("id-ID")} dan ${max.toLocaleString("id-ID")}.` });
        return z.NEVER;
      }
      return n;
    });

const optionalSlug = z
  .string()
  .trim()
  .toLowerCase()
  .max(SLUG_MAX, { error: `Slug maksimal ${SLUG_MAX} karakter.` })
  .refine((v) => v === "" || SLUG_RE.test(v), { error: "Slug hanya boleh huruf kecil, angka, dan tanda hubung." });

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const productFormSchema = z
  .object({
    name: z.string().trim().min(1, { error: "Masukkan nama produk." }).max(PRODUCT_NAME_MAX, { error: `Nama maksimal ${PRODUCT_NAME_MAX} karakter.` }),
    slug: optionalSlug,
    description: z.string().trim().max(PRODUCT_DESCRIPTION_MAX, { error: `Deskripsi maksimal ${PRODUCT_DESCRIPTION_MAX} karakter.` }),
    categoryId: z.uuid({ error: "Pilih kategori." }),
    price: optionalInt("Harga", 0, PRICE_MAX).refine((v) => v !== null, { error: "Masukkan harga." }),
    salePrice: optionalInt("Harga sale", 0, PRICE_MAX),
    productType: z.enum(["READY_STOCK", "PRE_ORDER"], { error: "Pilih tipe produk." }),
    minimumPreorderDays: optionalInt("Minimum Pre-Order", 1, 365),
    isFeatured: checkbox,
    availability: z.enum(["AVAILABLE", "SOLD_OUT"], { error: "Pilih availability." }),
    isActive: checkbox,
    maxQuantityPerOrder: optionalInt("Maksimal quantity", 1, 1000),
  })
  .superRefine((v, ctx) => {
    if (v.salePrice !== null && v.price !== null && v.salePrice >= v.price) {
      ctx.addIssue({ code: "custom", path: ["salePrice"], message: "Harga sale harus lebih kecil dari harga normal." });
    }
    if (v.productType === "PRE_ORDER" && v.minimumPreorderDays === null) {
      ctx.addIssue({ code: "custom", path: ["minimumPreorderDays"], message: "Isi minimum hari Pre-Order (minimal 1)." });
    }
  })
  .transform((v) => ({ ...v, price: v.price as number, minimumPreorderDays: v.productType === "PRE_ORDER" ? v.minimumPreorderDays : null }));

export type ProductFormValues = z.output<typeof productFormSchema>;

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, { error: "Masukkan nama kategori." }).max(80, { error: "Nama maksimal 80 karakter." }),
  slug: optionalSlug,
  description: z
    .string()
    .trim()
    .max(500, { error: "Deskripsi maksimal 500 karakter." })
    .transform((v) => (v === "" ? null : v)),
  sortOrder: optionalInt("Urutan", 0, 1000).transform((v) => v ?? 0),
  isActive: checkbox,
});

export type CategoryFormValues = z.output<typeof categoryFormSchema>;

export const altTextSchema = z
  .string()
  .trim()
  .min(1, { error: "Isi teks alternatif foto (deskripsi singkat isi foto)." })
  .max(ALT_TEXT_MAX, { error: `Teks alternatif maksimal ${ALT_TEXT_MAX} karakter.` });

export function fieldErrorsOf(error: z.ZodError): Partial<Record<string, string>> {
  const out: Partial<Record<string, string>> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
