import "server-only";

import path from "node:path";

import { getEnv } from "@/server/env";

import { createLocalStorage } from "./local-storage";
import type { ObjectStorage } from "./types";

export type { ObjectStorage, PrivateBucket, PublicBucket } from "./types";

const globalForStorage = globalThis as unknown as { __enjuaStorage?: ObjectStorage };

/** Configured storage driver. Phase 1 implements "local"; the S3-compatible driver follows the hosting decision (TD-17). */
export function getStorage(): ObjectStorage {
  if (!globalForStorage.__enjuaStorage) {
    const env = getEnv();
    switch (env.STORAGE_DRIVER) {
      case "local":
        globalForStorage.__enjuaStorage = createLocalStorage({
          baseDir: path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR),
          publicBaseUrl: "/storage",
        });
        break;
    }
  }
  return globalForStorage.__enjuaStorage!;
}
