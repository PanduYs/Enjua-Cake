import { describe, expect, it } from "vitest";

import { generateOrderNumber, normalizeOrderNumber, ORDER_NUMBER_PATTERN, ORDER_SUFFIX_ALPHABET } from "@/server/domain/orders/order-number";
import {
  createTrackingSession,
  generateTrackingToken,
  hashTrackingToken,
  normalizeTrackingToken,
  readTrackingSession,
  TRACKING_SESSION_TTL_MS,
  trackingTokenMatches,
} from "@/server/security/tracking-token";

describe("order number (TD-12, FD-70)", () => {
  it("uses the WIB creation date and an unambiguous suffix", () => {
    // 2026-10-02 17:30 UTC = 2026-10-03 00:30 WIB
    expect(generateOrderNumber(new Date("2026-10-02T17:30:00Z"), () => 0)).toBe("ENC-20261003-0000");
    expect(generateOrderNumber(new Date("2026-10-02T03:00:00Z"), (n) => n - 1)).toBe("ENC-20261002-ZZZZ");
    expect(ORDER_SUFFIX_ALPHABET).toHaveLength(32);
    expect(ORDER_SUFFIX_ALPHABET).not.toMatch(/[ILOU]/);
    for (let i = 0; i < 200; i++) {
      expect(generateOrderNumber(new Date(), (n) => Math.floor(Math.random() * n))).toMatch(ORDER_NUMBER_PATTERN);
    }
    expect(normalizeOrderNumber("  enc-20261002-ab12 ")).toBe("ENC-20261002-AB12");
  });
});

describe("tracking token (TD-11, FD-68)", () => {
  it("is 256-bit base64url, stored only as a hash, compared after normalization", () => {
    const token = generateTrackingToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateTrackingToken()).not.toBe(token);
    const hash = hashTrackingToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(trackingTokenMatches(normalizeTrackingToken(` ${token.slice(0, 10)} ${token.slice(10)}\n`), hash)).toBe(true);
    expect(trackingTokenMatches(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"), hash)).toBe(false);
    expect(trackingTokenMatches("", hash)).toBe(false);
  });
});

describe("tracking session cookie", () => {
  const secret = "s".repeat(32);
  const now = new Date("2026-10-02T03:00:00Z");
  const orderId = "8b0f4c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f";
  const hash = hashTrackingToken("t");

  it("round-trips and binds to the order and the current access code", () => {
    const { value, expiresAt } = createTrackingSession(orderId, hash, now, secret);
    expect(expiresAt.getTime() - now.getTime()).toBe(TRACKING_SESSION_TTL_MS);
    expect(readTrackingSession(value, now, secret)).toEqual({
      orderId,
      tokenRef: hash.slice(0, 16),
    });
    expect(value).not.toContain(hash);
  });

  it("rejects tampering, another secret, expiry, and junk", () => {
    const { value } = createTrackingSession(orderId, hash, now, secret);
    const [, ref, exp, sig] = value.split(".");
    expect(readTrackingSession(`00000000-0000-4000-8000-000000000000.${ref}.${exp}.${sig}`, now, secret)).toBeNull();
    expect(readTrackingSession(`${orderId}.${ref}.${Number(exp) + 3_600_000}.${sig}`, now, secret)).toBeNull();
    expect(readTrackingSession(value, now, "x".repeat(32))).toBeNull();
    expect(readTrackingSession(value, new Date(now.getTime() + TRACKING_SESSION_TTL_MS), secret)).toBeNull();
    expect(readTrackingSession(undefined, now, secret)).toBeNull();
    expect(readTrackingSession("a.b.c", now, secret)).toBeNull();
  });
});
