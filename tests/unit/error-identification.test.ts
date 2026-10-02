import { describe, expect, it } from "vitest";

import { isAuthClientError } from "@/server/services/admin-auth";
import { isStorageKeyError, StorageKeyError } from "@/server/storage/types";

/** Simulates an error class from a duplicated module copy (different identity, same shape). */
class ForeignError extends Error {
  constructor(name: string, public statusCode?: number) {
    super("x");
    this.name = name;
  }
}

describe("cross-chunk error identification", () => {
  it("recognizes StorageKeyError by name, even from another module copy", () => {
    expect(isStorageKeyError(new StorageKeyError("bad"))).toBe(true);
    expect(isStorageKeyError(new ForeignError("StorageKeyError"))).toBe(true);
    expect(isStorageKeyError(new Error("other"))).toBe(false);
    expect(isStorageKeyError("StorageKeyError")).toBe(false);
  });

  it("treats only 4xx Better Auth APIErrors as authentication outcomes", () => {
    expect(isAuthClientError(new ForeignError("APIError", 401))).toBe(true);
    expect(isAuthClientError(new ForeignError("APIError", 400))).toBe(true);
    expect(isAuthClientError(new ForeignError("APIError", 500))).toBe(false);
    expect(isAuthClientError(new ForeignError("APIError"))).toBe(false);
    expect(isAuthClientError(new Error("database down"))).toBe(false);
  });
});
