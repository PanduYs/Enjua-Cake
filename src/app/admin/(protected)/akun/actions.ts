"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getAuth } from "@/server/auth";
import { requireAdmin } from "@/server/auth/session";
import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { changeAdminPassword } from "@/server/services/admin-auth";
import { createAdmin, resetAdminPassword, setAdminActive } from "@/server/services/admin-users";
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

const ADMIN_ERROR: Record<string, string> = {
  NOT_FOUND: "Admin tidak ditemukan.",
  SELF: "Gunakan bagian Ganti Password untuk akun Anda sendiri.",
  LAST_ACTIVE_ADMIN: "Tidak dapat menonaktifkan admin aktif terakhir.",
  EMAIL_TAKEN: "Email sudah dipakai admin lain.",
  INVALID_INPUT: "Periksa kembali isian Anda.",
};

export async function createAdminAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const result = await createAdmin(
    getDb(),
    { name: formData.get("name"), email: formData.get("email"), password: formData.get("password"), confirmPassword: formData.get("confirmPassword") },
    admin.adminId,
  );
  if (!result.ok) {
    return { status: "error", message: ADMIN_ERROR[result.error], fieldErrors: result.fieldErrors, values: { name: String(formData.get("name") ?? ""), email: String(formData.get("email") ?? "") } };
  }
  revalidatePath("/admin/akun");
  return { status: "success", message: "Admin baru dibuat. Sampaikan password awal secara langsung dan minta admin menggantinya." };
}

export async function setAdminActiveAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const result = await setAdminActive(getDb(), { targetId: String(formData.get("adminId") ?? ""), active: formData.get("active") === "true", actorAdminId: admin.adminId });
  if (!result.ok) return { status: "error", message: ADMIN_ERROR[result.error] };
  revalidatePath("/admin/akun");
  return { status: "success", message: formData.get("active") === "true" ? "Admin diaktifkan." : "Admin dinonaktifkan dan seluruh sesinya diakhiri." };
}

export async function resetAdminPasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const result = await resetAdminPassword(getDb(), {
    targetId: String(formData.get("adminId") ?? ""),
    raw: { password: formData.get("password"), confirmPassword: formData.get("confirmPassword") },
    actorAdminId: admin.adminId,
  });
  if (!result.ok) return { status: "error", message: result.fieldErrors ? Object.values(result.fieldErrors)[0] : ADMIN_ERROR[result.error] };
  return { status: "success", message: "Password direset. Sesi admin tersebut telah diakhiri." };
}
