import "server-only";

import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  assertValidStorageKey,
  type ObjectStorage,
  type PrivateBucket,
  type PublicBucket,
  type StoredObject,
  type StoredObjectInfo,
} from "./types";

interface Meta {
  contentType: string;
}

function createLocalBucket(rootDir: string) {
  const resolve = (key: string) => {
    assertValidStorageKey(key);
    const filePath = path.resolve(rootDir, key);
    // Defense in depth on top of the key pattern.
    if (!filePath.startsWith(path.resolve(rootDir) + path.sep)) throw new Error("Storage path escapes bucket root");
    return filePath;
  };

  return {
    async put(key: string, body: Uint8Array, contentType: string): Promise<StoredObjectInfo> {
      const filePath = resolve(key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, body);
      await writeFile(`${filePath}.meta.json`, JSON.stringify({ contentType } satisfies Meta));
      return { key, contentType, size: body.byteLength };
    },
    async get(key: string): Promise<StoredObject | null> {
      const filePath = resolve(key);
      try {
        const [body, metaRaw] = await Promise.all([readFile(filePath), readFile(`${filePath}.meta.json`, "utf8")]);
        const meta = JSON.parse(metaRaw) as Meta;
        return { key, contentType: meta.contentType, size: body.byteLength, body: new Uint8Array(body) };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key: string): Promise<void> {
      const filePath = resolve(key);
      await rm(filePath, { force: true });
      await rm(`${filePath}.meta.json`, { force: true });
    },
    async exists(key: string): Promise<boolean> {
      try {
        await stat(resolve(key));
        return true;
      } catch {
        return false;
      }
    },
  };
}

export interface LocalStorageOptions {
  /** Base directory; "public" and "private" sub-directories are created beneath it. */
  baseDir: string;
  /** URL prefix under which public objects will be served (route added with product images in Phase 2). */
  publicBaseUrl: string;
}

/** Filesystem driver for local development and tests. Not for production (TD-16/TD-17). */
export function createLocalStorage(options: LocalStorageOptions): ObjectStorage {
  const publicBucket: PublicBucket = {
    visibility: "public",
    ...createLocalBucket(path.join(options.baseDir, "public")),
    publicUrl(key: string) {
      assertValidStorageKey(key);
      return `${options.publicBaseUrl.replace(/\/$/, "")}/${key}`;
    },
  };
  const privateBucket: PrivateBucket = {
    visibility: "private",
    ...createLocalBucket(path.join(options.baseDir, "private")),
  };
  return { public: publicBucket, private: privateBucket };
}
