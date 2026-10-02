import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Tracking access code (FD-66..69, TD-11): 32 random bytes (256 bits), base64url.
 * Only SHA-256(token) is stored; a fast hash is appropriate for high-entropy tokens.
 */
export function generateTrackingToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Customers may paste the code with spaces or line breaks. */
export function normalizeTrackingToken(input: string): string {
  return input.replace(/\s+/g, "");
}

export function hashTrackingToken(token: string): string {
  return createHash("sha256").update(normalizeTrackingToken(token), "utf8").digest("hex");
}

/** Constant-time comparison of a presented token against a stored hash. */
export function trackingTokenMatches(token: string, storedHash: string): boolean {
  const presented = Buffer.from(hashTrackingToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}

/**
 * Short-lived tracking session bound to one order AND the current access code:
 * "<orderId>.<tokenRef>.<expiresMs>.<hmac>", where tokenRef is a prefix of the stored
 * token hash. Regenerating the code changes the hash, so older sessions stop working
 * (DI-05). Signed with AUTH_SECRET so it cannot be forged or re-pointed.
 */
export const TRACKING_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`tracking:${payload}`).digest("base64url");
}

export function trackingTokenRef(storedHash: string): string {
  return storedHash.slice(0, 16);
}

export function createTrackingSession(orderId: string, storedHash: string, now: Date, secret: string): { value: string; expiresAt: Date } {
  const expiresAt = new Date(now.getTime() + TRACKING_SESSION_TTL_MS);
  const payload = `${orderId}.${trackingTokenRef(storedHash)}.${expiresAt.getTime()}`;
  return { value: `${payload}.${sign(payload, secret)}`, expiresAt };
}

export function readTrackingSession(value: string | undefined, now: Date, secret: string): { orderId: string; tokenRef: string } | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [orderId, tokenRef, expiresRaw, signature] = parts as [string, string, string, string];
  const expected = Buffer.from(sign(`${orderId}.${tokenRef}.${expiresRaw}`, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires <= now.getTime()) return null;
  return { orderId, tokenRef };
}
