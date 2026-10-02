import { NextResponse } from "next/server";

import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { readTrackingCookie } from "@/server/security/tracking-cookie";
import { getTrackingView } from "@/server/services/tracking";

/** Polling for the QRIS panel (§6.1); session-bound, no order data beyond statuses. */
export async function GET() {
  const session = await readTrackingCookie();
  const view = session ? await getTrackingView(getDb(), session, systemClock) : null;
  if (!view) return NextResponse.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(
    { ok: true, orderStatus: view.orderStatus, paymentStatus: view.paymentStatus, paidAmount: view.paidAmount },
    { headers: { "Cache-Control": "no-store" } },
  );
}
