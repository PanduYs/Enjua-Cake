import "server-only";

import path from "node:path";

import { getEnv } from "@/server/env";

import { createLocalStorage } from "./local-storage";
import { createS3Storage } from "./s3-storage";
import type { ObjectStorage } from "./types";

export type { ObjectStorage, PrivateBucket, PublicBucket } from "./types";

const globalForStorage = globalThis as unknown as { __enjuaStorage?: ObjectStorage };

/**
 * Configured storage driver: "local" (development, tests, or a single server with a
 * persistent volume) or "s3" (any S3-compatible service; TD-16/TD-17 options).
 */
export function getStorage(): ObjectStorage {
  if (!globalForStorage.__enjuaStorage) {
    const env = getEnv();
    switch (env.STORAGE_DRIVER) {
      case "local":
        globalForStorage.__enjuaStorage = createLocalStorage({
          // Runtime data directory, not source: exclude from output file tracing.
          baseDir: path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.STORAGE_LOCAL_DIR),
          publicBaseUrl: "/storage",
        });
        break;
      case "s3":
        globalForStorage.__enjuaStorage = createS3Storage({
          endpoint: env.STORAGE_ENDPOINT!,
          region: env.STORAGE_REGION!,
          accessKeyId: env.STORAGE_ACCESS_KEY_ID!,
          secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY!,
          publicBucket: env.STORAGE_PUBLIC_BUCKET!,
          privateBucket: env.STORAGE_PRIVATE_BUCKET!,
          publicBaseUrl: "/storage",
        });
        break;
    }
  }
  return globalForStorage.__enjuaStorage!;
}
