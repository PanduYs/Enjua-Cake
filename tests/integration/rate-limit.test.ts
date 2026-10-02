import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/server/db/client";
import { consumeRateLimit } from "@/server/security/rate-limit";

import { openTestDatabase, resetAuthTables } from "../support/db";

let handle: DatabaseHandle;
const rule = { limit: 3, windowSeconds: 60 };
const t0 = new Date("2026-10-02T08:00:00Z");
const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

beforeAll(() => {
  handle = openTestDatabase();
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  await resetAuthTables(handle);
});

describe("database rate limiter", () => {
  it("allows up to the limit inside a window, then blocks", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await consumeRateLimit(handle.db, "k", rule, at(i)));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3]?.retryAfterSeconds).toBe(57);
  });

  it("resets after the window elapses", async () => {
    for (let i = 0; i < 4; i++) await consumeRateLimit(handle.db, "k", rule, at(i));
    const afterWindow = await consumeRateLimit(handle.db, "k", rule, at(61));
    expect(afterWindow).toMatchObject({ allowed: true, remaining: 2 });
  });

  it("is atomic under concurrent requests", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => consumeRateLimit(handle.db, "burst", rule, at(0))));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
  });

  it("keeps keys independent", async () => {
    for (let i = 0; i < 3; i++) await consumeRateLimit(handle.db, "a", rule, at(i));
    await expect(consumeRateLimit(handle.db, "b", rule, at(3))).resolves.toMatchObject({ allowed: true });
  });
});
