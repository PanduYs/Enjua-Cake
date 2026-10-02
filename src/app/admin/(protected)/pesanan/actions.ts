"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { TRANSITION_ERROR_MESSAGE } from "@/lib/copy/orders";
import { requireAdmin } from "@/server/auth/session";
import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { ADMIN_ORDER_STATUSES } from "@/server/services/admin-orders";
import { regenerateTrackingToken, transitionOrder } from "@/server/services/order-lifecycle";

export type TransitionFormState = {
  status: "idle" | "error" | "success";
  message?: string;
};
export type RegenerateFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  token?: string;
};

const transitionSchema = z.object({
  orderId: z.uuid(),
  to: z.enum(ADMIN_ORDER_STATUSES),
  expectedFrom: z.enum(ADMIN_ORDER_STATUSES),
  reason: z.string().trim().max(500).optional(),
});

/** All rules live in transitionOrder / the state machine (TD-14); this only adapts the form. */
export async function transitionOrderAction(_prev: TransitionFormState, formData: FormData): Promise<TransitionFormState> {
  const admin = await requireAdmin();
  const parsed = transitionSchema.safeParse({
    orderId: formData.get("orderId"),
    to: formData.get("to"),
    expectedFrom: formData.get("expectedFrom"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) return { status: "error", message: "Permintaan tidak valid." };

  const result = await transitionOrder(
    getDb(),
    {
      orderId: parsed.data.orderId,
      to: parsed.data.to,
      expectedFrom: parsed.data.expectedFrom,
      reason: parsed.data.reason || null,
      actor: { type: "ADMIN", adminId: admin.adminId },
    },
    systemClock,
  );
  if (!result.ok) {
    return {
      status: "error",
      message: result.error === "NOT_FOUND" ? "Pesanan tidak ditemukan." : TRANSITION_ERROR_MESSAGE[result.error],
    };
  }
  revalidatePath("/admin/pesanan");
  revalidatePath(`/admin/pesanan/${parsed.data.orderId}`);
  return { status: "success", message: "Status pesanan diperbarui." };
}

/** New access code shown to the admin once; old code and sessions stop working (FD-72, DI-05). */
export async function regenerateTokenAction(_prev: RegenerateFormState, formData: FormData): Promise<RegenerateFormState> {
  const admin = await requireAdmin();
  const orderId = z.uuid().safeParse(formData.get("orderId"));
  if (!orderId.success) return { status: "error", message: "Permintaan tidak valid." };
  const token = await regenerateTrackingToken(getDb(), orderId.data, admin.adminId);
  if (!token) return { status: "error", message: "Pesanan tidak ditemukan." };
  revalidatePath(`/admin/pesanan/${orderId.data}`);
  return {
    status: "success",
    message: "Kode akses baru dibuat. Kode lama tidak berlaku lagi.",
    token,
  };
}
