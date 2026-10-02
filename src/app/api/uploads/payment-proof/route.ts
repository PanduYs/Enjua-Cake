import { NextResponse, type NextRequest } from "next/server";

import { PAYMENT_ERROR_MESSAGE } from "@/lib/copy/payments";
import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { PROOF_MAX_BYTES } from "@/server/domain/payments/proof-file";
import { isSameOriginRequest } from "@/server/security/request";
import { readTrackingCookie } from "@/server/security/tracking-cookie";
import { uploadPaymentProof } from "@/server/services/payments";
import { resolveTrackingSession } from "@/server/services/tracking";
import { getStorage } from "@/server/storage";

/** Customer transfer-proof upload; requires a verified tracking session (§6.1, §17). */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) return NextResponse.json({ ok: false, message: PAYMENT_ERROR_MESSAGE.NOT_FOUND }, { status: 403 });
  const db = getDb();
  const orderId = await resolveTrackingSession(db, await readTrackingCookie());
  if (!orderId) return NextResponse.json({ ok: false, message: "Sesi lacak pesanan berakhir. Masukkan kembali nomor pesanan dan kode akses." }, { status: 401 });

  // Reject oversized bodies before reading them (FD-50: checked before and after upload).
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > PROOF_MAX_BYTES + 64 * 1024) return NextResponse.json({ ok: false, message: PAYMENT_ERROR_MESSAGE.TOO_LARGE }, { status: 413 });

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("file");
    file = value instanceof File ? value : null;
  } catch {
    file = null;
  }
  if (!file) return NextResponse.json({ ok: false, message: PAYMENT_ERROR_MESSAGE.EMPTY }, { status: 400 });
  if (file.size > PROOF_MAX_BYTES) return NextResponse.json({ ok: false, message: PAYMENT_ERROR_MESSAGE.TOO_LARGE }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await uploadPaymentProof({ db, clock: systemClock, privateBucket: getStorage().private }, { orderId, bytes, actor: { type: "CUSTOMER" } });
  if (!result.ok) return NextResponse.json({ ok: false, message: PAYMENT_ERROR_MESSAGE[result.error] }, { status: 400 });
  return NextResponse.json({ ok: true });
}
