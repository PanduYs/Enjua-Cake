import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateStorageKey } from "@/server/storage/keys";
import { createLocalStorage } from "@/server/storage/local-storage";
import { assertValidStorageKey, StorageKeyError, type ObjectStorage } from "@/server/storage/types";

let baseDir: string;
let storage: ObjectStorage;

beforeEach(async () => {
  baseDir = await mkdtemp(path.join(os.tmpdir(), "enjua-storage-"));
  storage = createLocalStorage({ baseDir, publicBaseUrl: "/storage/" });
});

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

describe("local object storage", () => {
  it("stores and reads back objects with their content type", async () => {
    const key = generateStorageKey("payment-proofs", "application/pdf");
    const body = new TextEncoder().encode("%PDF-1.7 test");
    await expect(storage.private.put(key, body, "application/pdf")).resolves.toMatchObject({ key, size: body.byteLength });
    const object = await storage.private.get(key);
    expect(object?.contentType).toBe("application/pdf");
    expect(new TextDecoder().decode(object!.body)).toBe("%PDF-1.7 test");
    await expect(storage.private.exists(key)).resolves.toBe(true);
    await storage.private.delete(key);
    await expect(storage.private.get(key)).resolves.toBeNull();
  });

  it("keeps public and private buckets physically separate", async () => {
    const key = generateStorageKey("products", "image/png");
    await storage.private.put(key, new Uint8Array([1, 2, 3]), "image/png");
    await expect(storage.public.get(key)).resolves.toBeNull();
  });

  it("only the public bucket exposes URLs", () => {
    const key = generateStorageKey("products", "image/webp");
    expect(storage.public.publicUrl(key)).toBe(`/storage/${key}`);
    expect("publicUrl" in storage.private).toBe(false);
  });

  it("rejects unsafe keys (traversal, absolute, uppercase, no extension)", async () => {
    for (const bad of ["../etc/passwd.txt", "/abs/file.png", "a/../b.png", "Products/x.png", "noext", "a//b.png", ""]) {
      expect(() => assertValidStorageKey(bad)).toThrow(StorageKeyError);
    }
    await expect(storage.public.put("../escape.png", new Uint8Array([1]), "image/png")).rejects.toBeInstanceOf(StorageKeyError);
  });

  it("generates server-side keys and refuses unsupported content types", () => {
    expect(generateStorageKey("payment-proofs", "image/jpeg")).toMatch(/^payment-proofs\/[0-9a-f-]{36}\.jpg$/);
    expect(() => generateStorageKey("x", "text/html")).toThrow();
  });
});
