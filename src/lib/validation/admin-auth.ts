import { z } from "zod";

/** Shared by client forms (fast feedback) and server actions (authoritative) — PRD §37. */
export const ADMIN_PASSWORD_MIN = 12;
export const ADMIN_PASSWORD_MAX = 128;

export const adminLoginSchema = z.object({
  // Normalize first, then validate the format (Zod checks formats on the raw input).
  email: z
    .string({ error: "Masukkan alamat email yang valid." })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Masukkan alamat email yang valid." })),
  password: z.string({ error: "Masukkan password." }).min(1, { error: "Masukkan password." }).max(ADMIN_PASSWORD_MAX),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: "Masukkan password saat ini." }).max(ADMIN_PASSWORD_MAX),
    newPassword: z
      .string()
      .min(ADMIN_PASSWORD_MIN, { error: `Password baru minimal ${ADMIN_PASSWORD_MIN} karakter.` })
      .max(ADMIN_PASSWORD_MAX, { error: `Password baru maksimal ${ADMIN_PASSWORD_MAX} karakter.` }),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    error: "Konfirmasi password tidak sama.",
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    error: "Password baru harus berbeda dari password saat ini.",
  });

export interface FormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
  /** Non-secret values echoed back so React's post-action form reset does not wipe them. */
  values?: Partial<Record<string, string>>;
}

export const initialFormState: FormState = { status: "idle" };

/** First error message per field, for inline display. */
export function toFieldErrors(error: z.ZodError): Partial<Record<string, string>> {
  const result: Partial<Record<string, string>> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    result[key] ??= issue.message;
  }
  return result;
}
