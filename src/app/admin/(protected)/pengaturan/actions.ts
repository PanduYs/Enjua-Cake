"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/validation/admin-auth";
import { settingsFormToObject } from "@/lib/validation/admin-settings";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { updateWebsiteSettings } from "@/server/services/admin-settings";

export async function saveSettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const result = await updateWebsiteSettings(getDb(), settingsFormToObject(fd), admin.adminId);
  if (!result.ok) return { status: "error", message: "Periksa kembali isian yang ditandai.", fieldErrors: result.fieldErrors };
  // Settings feed the public layout (footer, WhatsApp, pickup info) and checkout rules.
  revalidatePath("/", "layout");
  return { status: "success", message: result.changed.length ? "Pengaturan disimpan." : "Tidak ada perubahan." };
}
