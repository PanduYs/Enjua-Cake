import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { expireDueReservations } from "@/server/services/order-lifecycle";

function authorized(request: NextRequest, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Sweeper for expired reservations and DP-balance transactions (TD-07, TD-09). */
async function handle(request: NextRequest) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 503 });
  if (!authorized(request, secret)) return NextResponse.json({ ok: false }, { status: 401 });
  const result = await expireDueReservations(getDb(), systemClock);
  return NextResponse.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
