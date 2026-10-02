import { z } from "zod";

import { normalizeWhatsAppNumber } from "@/lib/whatsapp";

/**
 * Website Settings form (PRD §32, FD-86–FD-88, TD-18). Empty optional fields are
 * stored as null so nothing is invented; the public site hides what is not set.
 */
export const MAX_BANK_ACCOUNTS = 5;
export const MAX_LINKS = 6;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Maksimal ${max} karakter.` })
    .transform((v) => (v === "" ? null : v));

const intIn = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, { error: `${label} harus berupa angka bulat.` })
    .transform(Number)
    .refine((n) => n >= min && n <= max, { error: `${label} harus antara ${min} dan ${max}.` });

const linkRow = z.object({ label: z.string().trim().max(60), url: z.string().trim().max(300) });
const bankRow = z.object({ bankName: z.string().trim().max(60), accountNumber: z.string().trim().max(40), accountHolder: z.string().trim().max(100) });

function links(rows: Array<z.infer<typeof linkRow>>, ctx: z.RefinementCtx, field: string) {
  const out: Array<{ label: string; url: string }> = [];
  rows.forEach((r, i) => {
    if (!r.label && !r.url) return;
    if (!r.label || !r.url) {
      ctx.addIssue({ code: "custom", path: [field], message: `Baris ${i + 1}: isi label dan URL, atau kosongkan keduanya.` });
      return;
    }
    try {
      const url = new URL(r.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocol");
    } catch {
      ctx.addIssue({ code: "custom", path: [field], message: `Baris ${i + 1}: URL harus diawali https://.` });
      return;
    }
    out.push({ label: r.label, url: r.url });
  });
  return out;
}

export const settingsFormSchema = z
  .object({
    business_name: z.string().trim().min(1, { error: "Nama bisnis wajib diisi." }).max(100, { error: "Maksimal 100 karakter." }),
    business_description: optionalText(1000),
    address: optionalText(300),
    whatsapp_number: z
      .string()
      .trim()
      .transform((v, ctx) => {
        if (v === "") return null;
        if (!normalizeWhatsAppNumber(v)) {
          ctx.addIssue({ code: "custom", message: "Masukkan nomor WhatsApp Indonesia yang valid, mis. 0812xxxxxxxx." });
          return z.NEVER;
        }
        return v;
      }),
    operating_hours: optionalText(300),
    pickup_hours: optionalText(300),
    pickup_instructions: optionalText(1000),
    payment_instructions: optionalText(1000),
    pickup_cutoff: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Format jam HH:MM, mis. 15:00." }),
    default_capacity: intIn("Kapasitas default", 0, 1000),
    booking_horizon_days: intIn("Booking horizon", 1, 365),
    qris_reservation_minutes: intIn("Masa reservasi QRIS", 10, 120),
    transfer_reservation_minutes: intIn("Masa reservasi Transfer", 30, 1440),
    bank_accounts: z.array(bankRow).max(MAX_BANK_ACCOUNTS),
    social_links: z.array(linkRow).max(MAX_LINKS),
    policy_links: z.array(linkRow).max(MAX_LINKS),
  })
  .transform((v, ctx) => {
    const banks: Array<{ bankName: string; accountNumber: string; accountHolder: string }> = [];
    v.bank_accounts.forEach((b, i) => {
      const filled = [b.bankName, b.accountNumber, b.accountHolder].filter(Boolean).length;
      if (filled === 0) return;
      if (filled < 3) ctx.addIssue({ code: "custom", path: ["bank_accounts"], message: `Rekening ${i + 1}: isi nama bank, nomor rekening, dan nama pemilik.` });
      else banks.push(b);
    });
    return {
      ...v,
      bank_accounts: banks,
      social_links: links(v.social_links, ctx, "social_links"),
      policy_links: links(v.policy_links, ctx, "policy_links"),
    };
  });

export type SettingsFormValues = z.output<typeof settingsFormSchema>;

/** FormData → raw object with arrays from indexed fields ("bank_accounts.0.bankName"). */
export function settingsFormToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const arrays: Record<string, Array<Record<string, string>>> = {};
  for (const [key, value] of fd.entries()) {
    if (typeof value !== "string" || key.startsWith("$")) continue;
    const m = /^(bank_accounts|social_links|policy_links)\.(\d+)\.(\w+)$/.exec(key);
    if (m) {
      const list = (arrays[m[1]!] ??= []);
      (list[Number(m[2])] ??= {})[m[3]!] = value;
    } else out[key] = value;
  }
  for (const name of ["bank_accounts", "social_links", "policy_links"]) out[name] = (arrays[name] ?? []).filter(Boolean);
  return out;
}
