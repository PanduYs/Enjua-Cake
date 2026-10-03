import "server-only";

import { AwsClient } from "aws4fetch";

import {
  assertValidStorageKey,
  type ObjectStorage,
  type PrivateBucket,
  type PublicBucket,
  type StoredObject,
  type StoredObjectInfo,
} from "./types";

/**
 * S3-compatible object storage (TD-16): works with AWS S3, Cloudflare R2, Supabase
 * Storage (S3 endpoint), MinIO, … — the hosting options of TD-17 without locking one.
 * Requests are signed with SigV4 and use path-style URLs (`{endpoint}/{bucket}/{key}`),
 * which every provider above supports.
 *
 * Public objects are still served through the app's `/storage/{key}` route, so URLs,
 * CSP (`img-src 'self'`) and image optimization stay identical across drivers; the
 * private bucket has no URL method at all (FD-51).
 */
export interface S3StorageOptions {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBucket: string;
  privateBucket: string;
  publicBaseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class StorageUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageUnavailableError";
  }
}

function createS3Bucket(client: AwsClient, options: S3StorageOptions, bucket: string) {
  const base = options.endpoint.replace(/\/$/, "");
  const url = (key: string) => {
    assertValidStorageKey(key);
    return `${base}/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  };
  const send = async (key: string, init: RequestInit): Promise<Response> => {
    try {
      return await client.fetch(url(key), { ...init, signal: AbortSignal.timeout(options.timeoutMs ?? 15_000) });
    } catch (error) {
      if (error instanceof Error && error.name === "StorageKeyError") throw error;
      throw new StorageUnavailableError(`Object storage request failed (${init.method ?? "GET"})`);
    }
  };
  const fail = (res: Response, action: string): never => {
    throw new StorageUnavailableError(`Object storage ${action} failed with HTTP ${res.status}`);
  };

  return {
    async put(key: string, body: Uint8Array, contentType: string): Promise<StoredObjectInfo> {
      const res = await send(key, { method: "PUT", body: body as Uint8Array<ArrayBuffer>, headers: { "content-type": contentType, "content-length": String(body.byteLength) } });
      if (!res.ok) fail(res, "upload");
      return { key, contentType, size: body.byteLength };
    },
    async get(key: string): Promise<StoredObject | null> {
      const res = await send(key, { method: "GET" });
      if (res.status === 404) return null;
      if (!res.ok) fail(res, "download");
      const body = new Uint8Array(await res.arrayBuffer());
      return { key, contentType: res.headers.get("content-type") ?? "application/octet-stream", size: body.byteLength, body };
    },
    async delete(key: string): Promise<void> {
      const res = await send(key, { method: "DELETE" });
      if (!res.ok && res.status !== 404) fail(res, "delete");
    },
    async exists(key: string): Promise<boolean> {
      const res = await send(key, { method: "HEAD" });
      if (res.status === 404) return false;
      if (!res.ok) fail(res, "lookup");
      return true;
    },
  };
}

export function createS3Storage(options: S3StorageOptions): ObjectStorage {
  if (options.publicBucket === options.privateBucket) {
    // Physically separate buckets are a security requirement (TD-16, FD-51).
    throw new Error("STORAGE_PUBLIC_BUCKET and STORAGE_PRIVATE_BUCKET must be different buckets");
  }
  const client = new AwsClient({
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    region: options.region,
    service: "s3",
  });
  if (options.fetch) {
    const custom = options.fetch;
    // aws4fetch signs a Request and calls global fetch; route the signed request through the injected fetch (tests).
    client.fetch = async (input: RequestInfo | URL, init?: RequestInit) => custom(await client.sign(input, init));
  }
  const publicBucket: PublicBucket = {
    visibility: "public",
    ...createS3Bucket(client, options, options.publicBucket),
    publicUrl(key: string) {
      assertValidStorageKey(key);
      return `${options.publicBaseUrl.replace(/\/$/, "")}/${key}`;
    },
  };
  const privateBucket: PrivateBucket = { visibility: "private", ...createS3Bucket(client, options, options.privateBucket) };
  return { public: publicBucket, private: privateBucket };
}
