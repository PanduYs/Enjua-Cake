import "server-only";

import { cookies } from "next/headers";

import { systemClock } from "@/server/clock";
import { getEnv } from "@/server/env";

import { createTrackingSession, readTrackingSession } from "./tracking-token";

/** HttpOnly session bound to one order after access-code verification (TD-11). */
export const TRACKING_COOKIE = "enjua_track";

export function trackingCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getEnv().NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export function issueTrackingCookie(orderId: string, tokenHash: string) {
  return createTrackingSession(orderId, tokenHash, systemClock.now(), getEnv().AUTH_SECRET);
}

export async function readTrackingCookie(): Promise<{
  orderId: string;
  tokenRef: string;
} | null> {
  const value = (await cookies()).get(TRACKING_COOKIE)?.value;
  return readTrackingSession(value, systemClock.now(), getEnv().AUTH_SECRET);
}

export async function clearTrackingCookie(): Promise<void> {
  (await cookies()).delete({ name: TRACKING_COOKIE, path: "/" });
}
