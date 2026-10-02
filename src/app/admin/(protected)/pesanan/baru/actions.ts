"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/server/auth/session";
import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { capacityForDate } from "@/server/services/admin-capacity";
import { placeManualOrder } from "@/server/services/manual-order";
import { getStorage } from "@/server/storage";

/** Manual Order (PRD §50). Authorization is checked here, server-side, on every call. */
export async function placeManualOrderAction(input: unknown, idempotencyKey: unknown, overrides: unknown) {
  const admin = await requireAdmin();
  const result = await placeManualOrder({ db: getDb(), clock: systemClock, publicBucket: getStorage().public }, input, { adminId: admin.adminId, idempotencyKey, overrides });
  if (result.ok) {
    revalidatePath("/admin/pesanan");
    revalidatePath("/admin/kapasitas");
  }
  return result;
}

export async function capacityForDateAction(date: string) {
  await requireAdmin();
  return capacityForDate(getDb(), systemClock, date);
}
