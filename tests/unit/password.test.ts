import { describe, expect, it } from "vitest";

import { hashPassword, PASSWORD_HASH_OPTIONS, verifyPassword } from "@/server/security/password";

describe("password hashing (Argon2id)", () => {
  it("produces an Argon2id PHC string with OWASP minimum parameters", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).toContain(`m=${PASSWORD_HASH_OPTIONS.memoryCost},t=${PASSWORD_HASH_OPTIONS.timeCost},p=${PASSWORD_HASH_OPTIONS.parallelism}`);
  });

  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery");
    await expect(verifyPassword(hash, "correct horse battery")).resolves.toBe(true);
    await expect(verifyPassword(hash, "wrong horse battery")).resolves.toBe(false);
  });

  it("salts every hash", async () => {
    const [a, b] = await Promise.all([hashPassword("same password!!"), hashPassword("same password!!")]);
    expect(a).not.toBe(b);
  });

  it("returns false (never throws) for malformed hashes", async () => {
    await expect(verifyPassword("not-a-hash", "anything")).resolves.toBe(false);
  });
});
