import { NextResponse, type NextRequest } from "next/server";

import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { logger } from "@/server/observability/logger";
import { getPaymentProvider } from "@/server/payments";
import { declaredContentLength } from "@/server/security/request";
import { processPaymentWebhook } from "@/server/services/payment-webhook";

/** Payment gateway notifications (IMPLEMENTATION-PLAN §16). The only path that confirms QRIS (FD-111). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const provider = getPaymentProvider();
  if ((await params).provider !== provider.name) return NextResponse.json({ ok: false }, { status: 404 });
  // Gateway notifications are small JSON documents.
  const declared = declaredContentLength(request.headers);
  if (declared !== null && declared > 64 * 1024) return NextResponse.json({ ok: false }, { status: 413 });
  const result = await processPaymentWebhook({ db: getDb(), clock: systemClock, provider }, request);
  (result.status === 200 ? logger.info : logger.warn)("payment_webhook", { provider: provider.name, status: result.status, outcome: result.outcome });
  return NextResponse.json({ ok: result.status === 200, result: result.outcome }, { status: result.status });
}
