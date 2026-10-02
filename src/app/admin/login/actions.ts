"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "@/server/auth";
import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { loginAdmin } from "@/server/services/admin-auth";
import type { FormState } from "@/lib/validation/admin-auth";

export async function loginAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const rawEmail = formData.get("email");
  // Echo only the email back (never the password).
  const values = { email: typeof rawEmail === "string" ? rawEmail.slice(0, 254) : "" };
  const result = await loginAdmin(
    { auth: getAuth(), db: getDb(), clock: systemClock },
    { email: formData.get("email"), password: formData.get("password") },
    await headers(),
  );

  if (!result.ok) {
    switch (result.code) {
      case "INVALID_INPUT":
        return { status: "error", message: "Periksa kembali isian Anda.", fieldErrors: result.fieldErrors, values };
      case "RATE_LIMITED":
        return { status: "error", message: "Terlalu banyak percobaan masuk. Silakan coba lagi dalam beberapa menit.", values };
      case "INVALID_CREDENTIALS":
        return { status: "error", message: "Email atau password tidak cocok.", values };
    }
  }

  redirect("/admin");
}
