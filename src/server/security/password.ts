import "server-only";

import { hash, verify, type Algorithm } from "@node-rs/argon2";

/**
 * Argon2id with OWASP Password Storage Cheat Sheet minimum parameters
 * (m = 19 MiB, t = 2, p = 1). Output is a self-describing PHC string, so
 * parameters can be raised later without breaking existing hashes.
 */
const ARGON2ID = 2 as Algorithm; // Algorithm.Argon2id (ambient const enum; isolatedModules-safe literal)

export const PASSWORD_HASH_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const MIN_ADMIN_PASSWORD_LENGTH = 12;
export const MAX_ADMIN_PASSWORD_LENGTH = 128;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, PASSWORD_HASH_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // Malformed or non-Argon2 hash: treat as mismatch, never throw to the caller.
    return false;
  }
}
