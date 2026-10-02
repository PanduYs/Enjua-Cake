import { parsePhoneNumberFromString } from "libphonenumber-js/mobile";
import { z } from "zod";

/**
 * Checkout input (FD-34, FD-35, PRD §37). Shared by the form (fast feedback) and
 * the server (authoritative). No email or delivery address in V1.
 */
export const CUSTOMER_NAME_MAX = 100;
export const NOTES_MAX = 500;

/** Indonesian mobile number → E.164 ("+628…"), or null. */
export function normalizeIndonesianMobile(value: string): string | null {
  const phone = parsePhoneNumberFromString(value.trim(), "ID");
  if (!phone || !phone.isValid() || phone.country !== "ID") return null;
  return phone.number;
}

export const cartLineSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(1),
});

export const cartLinesSchema = z.array(cartLineSchema).min(1, { error: "Keranjang masih kosong." }).max(100);

export const checkoutInputSchema = z.object({
  items: cartLinesSchema,
  customerName: z
    .string({ error: "Masukkan nama." })
    .trim()
    .min(1, { error: "Masukkan nama." })
    .max(CUSTOMER_NAME_MAX, { error: `Nama maksimal ${CUSTOMER_NAME_MAX} karakter.` }),
  whatsapp: z
    .string({ error: "Masukkan nomor WhatsApp." })
    .transform((value, ctx) => {
      const normalized = normalizeIndonesianMobile(value);
      if (!normalized) {
        ctx.addIssue({ code: "custom", message: "Masukkan nomor WhatsApp Indonesia yang valid, mis. 0812xxxxxxxx." });
        return z.NEVER;
      }
      return normalized;
    }),
  notes: z
    .string()
    .trim()
    .max(NOTES_MAX, { error: `Catatan maksimal ${NOTES_MAX} karakter.` })
    .optional()
    .transform((v) => (v ? v : null)),
  pickupDate: z.string({ error: "Pilih tanggal pickup." }).regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Pilih tanggal pickup." }),
  paymentMethod: z.enum(["QRIS", "BANK_TRANSFER", "CASH"], { error: "Pilih metode pembayaran." }),
  paymentOption: z.enum(["DP_50", "FULL"], { error: "Pilih opsi pembayaran." }),
});

export type CheckoutInput = z.input<typeof checkoutInputSchema>;
export type CheckoutData = z.output<typeof checkoutInputSchema>;
