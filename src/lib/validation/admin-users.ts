import { z } from "zod";

import { ADMIN_PASSWORD_MAX, ADMIN_PASSWORD_MIN } from "./admin-auth";

const password = z
  .string()
  .min(ADMIN_PASSWORD_MIN, { error: `Password minimal ${ADMIN_PASSWORD_MIN} karakter.` })
  .max(ADMIN_PASSWORD_MAX, { error: `Password maksimal ${ADMIN_PASSWORD_MAX} karakter.` });

/** New admin account (TD-10: admins are created by another admin, no public sign-up). */
export const createAdminSchema = z
  .object({
    name: z.string().trim().min(1, { error: "Masukkan nama." }).max(100, { error: "Nama maksimal 100 karakter." }),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email({ error: "Masukkan alamat email yang valid." })),
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], error: "Konfirmasi password tidak sama." });

/** Password reset of ANOTHER admin (§8.1 recovery; own password uses the Akun page). */
export const resetPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], error: "Konfirmasi password tidak sama." });
