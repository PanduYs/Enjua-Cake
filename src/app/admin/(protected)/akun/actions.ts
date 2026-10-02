"use server";

import { headers } from "next/headers";

import { getAuth } from "@/server/auth";
import { requireAdmin } from "@/server/auth/session";
import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { changeAdminPassword } from "@/server/services/admin-auth";
import type { FormState } from "@/lib/validation/admin-auth";

export async function changePasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const result = await changeAdminPassword(
    { auth: getAuth(), db: getDb(), clock: systemClock },
    admin.adminId,
    {
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    },
    await headers(),
  );

  if (!result.ok) {
    if (result.code === "INVALID_INPUT") {
      return { status: "error", message: "Periksa kembali isian Anda.", fieldErrors: result.fieldErrors };
    }
    return { status: "error", message: "Password saat ini tidak cocok.", fieldErrors: { currentPassword: "Password saat ini tidak cocok." } };
  }

  return { status: "success", message: "Password berhasil diganti. Sesi di perangkat lain telah dikeluarkan." };
}
