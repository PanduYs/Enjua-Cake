import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { randomUuid } from "@/lib/random-uuid";

// What placeOrder / placeManualOrder accept as an idempotency key (TD-15).
const serverKeySchema = z.uuid();
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Web Crypto as seen over plain http from a LAN address: no randomUUID (a [SecureContext] API). */
function insecureContextCrypto() {
  const real = globalThis.crypto;
  const getRandomValues = vi.fn(<T extends ArrayBufferView | null>(array: T) => real.getRandomValues(array as Uint8Array) as unknown as T);
  vi.stubGlobal("crypto", { getRandomValues });
  return getRandomValues;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("randomUuid (checkout idempotency keys)", () => {
  it("uses crypto.randomUUID when the context provides it", () => {
    const spy = vi.spyOn(globalThis.crypto, "randomUUID");
    const key = randomUuid();
    expect(spy).toHaveBeenCalledOnce();
    expect(key).toMatch(V4);
    expect(serverKeySchema.safeParse(key).success).toBe(true);
  });

  it("without randomUUID (non-secure context) builds a v4 UUID from getRandomValues, never Math.random", () => {
    const getRandomValues = insecureContextCrypto();
    const mathRandom = vi.spyOn(Math, "random");
    const keys = Array.from({ length: 5000 }, () => randomUuid());
    expect(getRandomValues).toHaveBeenCalledTimes(5000);
    expect(mathRandom).not.toHaveBeenCalled();
    for (const key of keys) {
      expect(key).toMatch(V4);
      expect(serverKeySchema.safeParse(key).success).toBe(true);
    }
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("sets the version and variant bits on every key regardless of the random bytes", () => {
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a.fill(0xff) });
    expect(randomUuid()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a.fill(0x00) });
    expect(randomUuid()).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("refuses to produce a key without a secure random source", () => {
    vi.stubGlobal("crypto", undefined);
    expect(() => randomUuid()).toThrow(/secure random/);
  });
});
