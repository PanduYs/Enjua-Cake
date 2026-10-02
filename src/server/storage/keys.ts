import "server-only";

import { randomUUID } from "node:crypto";

import { assertValidStorageKey } from "./types";

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Server-generated key: "<prefix>/<uuid>.<ext>". Original file names are never used (FD-51). */
export function generateStorageKey(prefix: string, contentType: string): string {
  const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
  if (!extension) throw new Error(`Unsupported content type for storage: ${contentType}`);
  const key = `${prefix}/${randomUUID()}.${extension}`;
  assertValidStorageKey(key);
  return key;
}
