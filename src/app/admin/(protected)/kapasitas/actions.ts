"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/validation/admin-auth";
import { requireAdmin } from "@/server/auth/session";
import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { updatePickupDate, type CapacityError } from "@/server/services/admin-capacity";

const MESSAGE: Record<CapacityError, string> = {
  INVALID_DATE: "Tanggal tidak valid.",
  PAST_DATE: "Tanggal yang sudah lewat tidak dapat diubah.",
  INVALID_CAPACITY: "Kapasitas harus bilangan bulat 0–1000.",
};

function done(used: number, text: string): FormState {
  revalidatePath("/admin/kapasitas");
  revalidatePath("/admin");
  revalidatePath("/checkout");
  return { status: "success", message: used > 0 ? `${text} ${used} pesanan aktif di tanggal ini tetap berlaku.` : text };
}

export async function blockDateAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const blocked = fd.get("blocked") === "true";
  const result = await updatePickupDate(getDb(), systemClock, {
    date: String(fd.get("date") ?? ""),
    adminId: admin.adminId,
    kind: "block",
    blocked,
    reason: String(fd.get("reason") ?? "").slice(0, 200),
  });
  if (!result.ok) return { status: "error", message: MESSAGE[result.error] };
  return done(result.used, blocked ? "Tanggal diblokir untuk pesanan baru." : "Blokir tanggal dibuka.");
}

export async function capacityOverrideAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const raw = String(fd.get("capacity") ?? "").trim();
  const clear = fd.get("intent") === "clear" || raw === "";
  const value = clear ? null : /^\d+$/.test(raw) ? Number(raw) : NaN;
  const result = await updatePickupDate(getDb(), systemClock, {
    date: String(fd.get("date") ?? ""),
    adminId: admin.adminId,
    kind: "capacity",
    capacityOverride: value,
  });
  if (!result.ok) return { status: "error", message: MESSAGE[result.error] };
  return done(result.used, clear ? "Kapasitas kembali ke default." : "Kapasitas tanggal disimpan.");
}
