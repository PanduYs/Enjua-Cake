/**
 * RFC 4122 version 4 UUID for browser code (e.g. checkout idempotency keys, TD-15).
 *
 * crypto.randomUUID() is a [SecureContext] API: it is missing when the site is opened over
 * plain http from a non-localhost address (a phone on the LAN during development, any http
 * deployment). crypto.getRandomValues() is available in every context and is the same CSPRNG,
 * so the fallback builds the identical format from 122 random bits — never Math.random().
 */
export function randomUuid(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") return webCrypto.randomUUID();
  if (typeof webCrypto?.getRandomValues !== "function") {
    throw new Error("A cryptographically secure random number generator is not available");
  }

  const bytes = webCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10xx (RFC 4122)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
