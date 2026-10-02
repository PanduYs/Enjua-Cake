import { toWibCompactDate } from "../time/wib";

/** Crockford Base32 without ambiguous I, L, O, U (TD-12). */
export const ORDER_SUFFIX_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const ORDER_NUMBER_PATTERN = /^ENC-\d{8}-[0-9A-HJKMNP-TV-Z]{4}$/;

/**
 * ENC-YYYYMMDD-XXXX — date is the WIB order-creation date (FD-70). Uniqueness is
 * enforced by the database; callers retry on collision. `randomIndex(n)` must
 * return a uniform integer in [0, n) from a CSPRNG.
 */
export function generateOrderNumber(now: Date, randomIndex: (n: number) => number): string {
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += ORDER_SUFFIX_ALPHABET[randomIndex(ORDER_SUFFIX_ALPHABET.length)];
  return `ENC-${toWibCompactDate(now)}-${suffix}`;
}

/** Customer-typed order numbers: trim and uppercase. */
export function normalizeOrderNumber(input: string): string {
  return input.trim().toUpperCase();
}
