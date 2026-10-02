"use server";

import { redirect } from "next/navigation";

import { PAYMENT_ERROR_MESSAGE } from "@/lib/copy/payments";
import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { getMockPaymentProvider, getPaymentProvider } from "@/server/payments";
import { clearTrackingCookie, readTrackingCookie } from "@/server/security/tracking-cookie";
import { processPaymentWebhook } from "@/server/services/payment-webhook";
import { activeQrisReference, requestQrisPayment, startTransferRemainingPayment } from "@/server/services/payments";
import { resolveTrackingSession } from "@/server/services/tracking";

export type PaymentActionState = { ok: boolean; message?: string };

const SESSION_EXPIRED = "Sesi lacak pesanan berakhir. Masukkan kembali nomor pesanan dan kode akses.";

async function trackedOrderId() {
  return resolveTrackingSession(getDb(), await readTrackingCookie());
}

/** "Lacak pesanan lain": drop the current tracking session. */
export async function clearTrackingAction() {
  await clearTrackingCookie();
  redirect("/lacak");
}

/** Show / create the QRIS for the amount due now (initial or remaining). */
export async function requestQrisAction(): Promise<PaymentActionState> {
  const orderId = await trackedOrderId();
  if (!orderId) return { ok: false, message: SESSION_EXPIRED };
  const result = await requestQrisPayment({ db: getDb(), clock: systemClock, provider: getPaymentProvider() }, orderId);
  return result.ok ? { ok: true } : { ok: false, message: PAYMENT_ERROR_MESSAGE[result.error] };
}

/** Remaining payment by bank transfer (FD-46). */
export async function startTransferRemainingAction(): Promise<PaymentActionState> {
  const orderId = await trackedOrderId();
  if (!orderId) return { ok: false, message: SESSION_EXPIRED };
  const result = await startTransferRemainingPayment({ db: getDb(), clock: systemClock }, orderId);
  return result.ok ? { ok: true } : { ok: false, message: PAYMENT_ERROR_MESSAGE[result.error] };
}

/**
 * Development/test only (PAYMENT_PROVIDER=mock, which env.ts forbids with
 * PAYMENT_ENV=production): simulates the customer paying the active QR. The
 * signed webhook goes through the same verification path as a real gateway.
 */
export async function simulateMockPaymentAction(outcome: "PAID" | "FAILED"): Promise<PaymentActionState> {
  const mock = getMockPaymentProvider();
  if (!mock) return { ok: false, message: "Simulasi hanya tersedia di mode uji." };
  const orderId = await trackedOrderId();
  if (!orderId) return { ok: false, message: SESSION_EXPIRED };
  const reference = await activeQrisReference(getDb(), orderId, systemClock);
  if (!reference) return { ok: false, message: "Tidak ada QRIS aktif." };
  const result = await processPaymentWebhook({ db: getDb(), clock: systemClock, provider: mock }, mock.simulatePayment(reference, outcome));
  return { ok: result.status === 200 };
}
