import { NextResponse, type NextRequest } from "next/server";

import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { getPaymentProvider } from "@/server/payments";
import { processPaymentWebhook } from "@/server/services/payment-webhook";

/** Payment gateway notifications (IMPLEMENTATION-PLAN §16). The only path that confirms QRIS (FD-111). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const provider = getPaymentProvider();
  if ((await params).provider !== provider.name) return NextResponse.json({ ok: false }, { status: 404 });
  const result = await processPaymentWebhook({ db: getDb(), clock: systemClock, provider }, request);
  return NextResponse.json({ ok: result.status === 200, result: result.outcome }, { status: result.status });
}
