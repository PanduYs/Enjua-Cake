import { randomUUID } from "node:crypto";

import { AwsClient } from "aws4fetch";
import { beforeAll, describe, expect, it } from "vitest";

import { createS3Storage } from "@/server/storage/s3-storage";

/**
 * Runs against a real S3-compatible HTTP server (CI starts `moto_server`; locally set
 * S3_TEST_ENDPOINT, e.g. http://127.0.0.1:9010). Skipped when no endpoint is given.
 * Test-only dummy credentials — never production values.
 */
const endpoint = process.env.S3_TEST_ENDPOINT;
const creds = { accessKeyId: "test-access-key", secretAccessKey: "test-secret-key", region: "us-east-1" };
const suffix = randomUUID().slice(0, 8);
const buckets = { publicBucket: `enjua-public-${suffix}`, privateBucket: `enjua-private-${suffix}` };

describe.skipIf(!endpoint)("S3-compatible storage driver (TD-16)", () => {
  const storage = () => createS3Storage({ endpoint: endpoint!, ...creds, ...buckets, publicBaseUrl: "/storage" });

  beforeAll(async () => {
    const admin = new AwsClient({ ...creds, service: "s3" });
    for (const bucket of Object.values(buckets)) {
      const res = await admin.fetch(`${endpoint}/${bucket}`, { method: "PUT" });
      expect(res.ok).toBe(true);
    }
  });

  it("puts, reads, checks and deletes objects in separate public/private buckets", async () => {
    const s = storage();
    const body = new TextEncoder().encode("%PDF-1.4 bukti");
    await s.private.put("proofs/abc/1.pdf", body, "application/pdf");
    expect(await s.private.exists("proofs/abc/1.pdf")).toBe(true);
    expect(await s.public.exists("proofs/abc/1.pdf")).toBe(false); // physically separate (FD-51)
    const got = await s.private.get("proofs/abc/1.pdf");
    expect(got).toMatchObject({ key: "proofs/abc/1.pdf", contentType: "application/pdf", size: body.byteLength });
    expect(new TextDecoder().decode(got!.body)).toBe("%PDF-1.4 bukti");
    await s.private.delete("proofs/abc/1.pdf");
    expect(await s.private.get("proofs/abc/1.pdf")).toBeNull();
    await s.private.delete("proofs/abc/1.pdf"); // idempotent
  });

  it("public URLs stay same-origin and invalid keys are refused before any request", async () => {
    const s = storage();
    await s.public.put("products/x.webp", new Uint8Array([1, 2, 3]), "image/webp");
    expect(s.public.publicUrl("products/x.webp")).toBe("/storage/products/x.webp");
    expect("publicUrl" in s.private).toBe(false);
    await expect(s.public.get("../secret.txt")).rejects.toMatchObject({ name: "StorageKeyError" });
  });

  it("wrong credentials surface as StorageUnavailableError, not as missing files", async () => {
    const bad = createS3Storage({ endpoint: endpoint!, ...creds, ...buckets, publicBaseUrl: "/storage", privateBucket: "does-not-exist-bucket" });
    await expect(bad.private.put("proofs/a/b.pdf", new Uint8Array([1]), "application/pdf")).rejects.toMatchObject({ name: "StorageUnavailableError" });
  });

  it("refuses a single bucket for public and private objects", () => {
    expect(() => createS3Storage({ endpoint: endpoint!, ...creds, publicBucket: "same", privateBucket: "same", publicBaseUrl: "/storage" })).toThrow(/different buckets/);
  });
});
