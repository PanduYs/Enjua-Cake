import { NextResponse, type NextRequest } from "next/server";

import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { declaredContentLength, getClientIp, isSameOriginRequest } from "@/server/security/request";
import { issueTrackingCookie, TRACKING_COOKIE, trackingCookieOptions } from "@/server/security/tracking-cookie";
import { verifyTrackingAccess } from "@/server/services/tracking";

/** Order number + access code → HttpOnly tracking session (TD-11, FD-66). */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) return NextResponse.json({ ok: false, code: "INVALID" }, { status: 403 });

  const declared = declaredContentLength(request.headers);
  if (declared === null || declared > 4 * 1024) return NextResponse.json({ ok: false, code: "INVALID" }, { status: 413 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID" }, { status: 400 });
  }

  const result = await verifyTrackingAccess({ db: getDb(), clock: systemClock }, body, getClientIp(request.headers));
  if (!result.ok) {
    return NextResponse.json({ ok: false, code: result.code }, { status: result.code === "RATE_LIMITED" ? 429 : 401 });
  }

  const session = issueTrackingCookie(result.orderId, result.tokenHash);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(TRACKING_COOKIE, session.value, trackingCookieOptions(session.expiresAt));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
