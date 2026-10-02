"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ADMIN_PAYMENT_ERROR_MESSAGE, PAYMENT_ERROR_MESSAGE } from "@/lib/copy/payments";
import { requireAdmin } from "@/server/auth/session";
import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { approvePaymentProof, completeRefund, markCashPaid, recordRefund, REFUND_STATUSES, rejectPaymentProof, resolvePaymentException } from "@/server/services/payment-admin";
import { uploadPaymentProof } from "@/server/services/payments";
import { getStorage } from "@/server/storage";

export type AdminActionState = { status: "idle" | "error" | "success"; message?: string };

const uuid = z.uuid();
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "");

function done(orderId: string, message: string): AdminActionState {
  revalidatePath("/admin/pembayaran");
  revalidatePath("/admin/pesanan");
  revalidatePath(`/admin/pesanan/${orderId}`);
  return { status: "success", message };
}
const fail = (error: keyof typeof ADMIN_PAYMENT_ERROR_MESSAGE): AdminActionState => ({ status: "error", message: ADMIN_PAYMENT_ERROR_MESSAGE[error] });
const invalid: AdminActionState = { status: "error", message: "Permintaan tidak valid." };

export async function approveProofAction(_prev: AdminActionState, fd: FormData): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const proofId = uuid.safeParse(fd.get("proofId"));
  const orderId = uuid.safeParse(fd.get("orderId"));
  if (!proofId.success || !orderId.success) return invalid;
  const r = await approvePaymentProof(getDb(), { proofId: proofId.data, adminId: admin.adminId }, systemClock);
  if (!r.ok) return fail(r.error);
  return done(
    orderId.data,
    r.exception ? "Pembayaran disetujui dan dicatat sebagai Payment Exception." : r.orderConfirmed ? "Pembayaran disetujui. Pesanan dikonfirmasi." : "Pembayaran disetujui.",
  );
}

export async function rejectProofAction(_prev: AdminActionState, fd: FormData): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const proofId = uuid.safeParse(fd.get("proofId"));
  const orderId = uuid.safeParse(fd.get("orderId"));
  if (!proofId.success || !orderId.success) return invalid;
  const r = await rejectPaymentProof(getDb(), { proofId: proofId.data, adminId: admin.adminId, reason: text(fd, "reason").slice(0, 500) }, systemClock);
  if (!r.ok) return fail(r.error);
  return done(orderId.data, r.orderExpired ? "Bukti ditolak. Batas waktu sudah lewat sehingga pesanan dibatalkan otomatis." : "Bukti ditolak. Customer dapat mengunggah bukti baru.");
}

export async function markCashPaidAction(_prev: AdminActionState, fd: FormData): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orderId = uuid.safeParse(fd.get("orderId"));
  if (!orderId.success) return invalid;
  const r = await markCashPaid(getDb(), { orderId: orderId.data, adminId: admin.adminId }, systemClock);
  return r.ok ? done(orderId.data, "Pembayaran Cash tercatat lunas.") : fail(r.error);
}

export async function recordRefundAction(_prev: AdminActionState, fd: FormData): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orderId = uuid.safeParse(fd.get("orderId"));
  const status = z.enum(REFUND_STATUSES).safeParse(fd.get("status"));
  const amount = Number(text(fd, "amount").replace(/[^\d]/g, ""));
  if (!orderId.success || !status.success) return invalid;
  const r = await recordRefund(getDb(), { orderId: orderId.data, adminId: admin.adminId, amount, reason: text(fd, "reason").slice(0, 500), status: status.data }, systemClock);
  return r.ok ? done(orderId.data, "Refund tercatat.") : fail(r.error);
}

export async function completeRefundAction(_prev: AdminActionState, fd: FormData): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const refundId = uuid.safeParse(fd.get("refundId"));
  const orderId = uuid.safeParse(fd.get("orderId"));
  if (!refundId.success || !orderId.success) return invalid;
  const r = await completeRefund(getDb(), { refundId: refundId.data, adminId: admin.adminId }, systemClock);
  return r.ok ? done(orderId.data, "Refund ditandai selesai.") : fail(r.error);
}

export async function resolveExceptionAction(_prev: AdminActionState, fd: FormData): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const exceptionId = uuid.safeParse(fd.get("exceptionId"));
  const orderId = uuid.safeParse(fd.get("orderId"));
  const resolution = z.enum(["REFUNDED", "RESOLVED_MANUALLY"]).safeParse(fd.get("resolution"));
  if (!exceptionId.success || !orderId.success || !resolution.success) return invalid;
  const r = await resolvePaymentException(getDb(), { exceptionId: exceptionId.data, adminId: admin.adminId, resolution: resolution.data, note: text(fd, "note").slice(0, 500) }, systemClock);
  return r.ok ? done(orderId.data, "Payment Exception diselesaikan.") : fail(r.error);
}

/** Proof received via WhatsApp, uploaded by the admin on the order's behalf (PRD §18). */
export async function adminUploadProofAction(_prev: AdminActionState, fd: FormData): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orderId = uuid.safeParse(fd.get("orderId"));
  const file = fd.get("file");
  if (!orderId.success) return invalid;
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: PAYMENT_ERROR_MESSAGE.EMPTY };
  const r = await uploadPaymentProof(
    { db: getDb(), clock: systemClock, privateBucket: getStorage().private },
    { orderId: orderId.data, bytes: new Uint8Array(await file.arrayBuffer()), actor: { type: "ADMIN", adminId: admin.adminId } },
  );
  return r.ok ? done(orderId.data, "Bukti pembayaran diunggah dan menunggu verifikasi.") : { status: "error", message: PAYMENT_ERROR_MESSAGE[r.error] };
}
