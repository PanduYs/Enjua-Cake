import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, inject } from "vitest";

import type { DatabaseHandle } from "@/server/db/client";

import { openProxiedDatabase, type startWireProxy } from "../support/wire-proxy";

let proxy: ReturnType<typeof startWireProxy>;
let handle: DatabaseHandle;

beforeAll(async () => {
  // Same small pool as Vercel Preview (DATABASE_POOL_MAX=2) so queries must queue.
  ({ handle, proxy } = await openProxiedDatabase(inject("databaseUrl"), 2));
});
afterAll(async () => {
  await handle.close();
  await proxy.close();
});

describe("database client never pipelines (transaction-mode pooler safety)", () => {
  it("keeps one query in flight per connection for a dashboard-style burst and concurrent transactions", async () => {
    const reads = Array.from({ length: 13 }, (_, i) =>
      // Parameterless statements are the ones postgres.js would pipeline by default.
      i % 2 ? handle.db.execute(sql`select ${i}::int as i`) : handle.db.execute(sql.raw(`select ${i}::int as i`)),
    );
    const transactions = Array.from({ length: 3 }, (_, n) =>
      handle.db.transaction(async (tx) => {
        const [a, b] = await Promise.all([tx.execute(sql.raw("select 1 as v")), tx.execute(sql`select ${n}::int as v`)]);
        return [a[0]?.v, b[0]?.v];
      }),
    );

    const [rows, txResults] = await Promise.all([Promise.all(reads), Promise.all(transactions)]);

    expect(rows.map((r) => r[0]?.i)).toEqual(Array.from({ length: 13 }, (_, i) => i));
    expect(txResults).toEqual([
      [1, 0],
      [1, 1],
      [1, 2],
    ]);
    expect(proxy.maxInFlight()).toBe(1);
  });

  it("rolls a failed transaction back on its own connection", async () => {
    await expect(
      handle.db.transaction(async (tx) => {
        await tx.execute(sql.raw("select 1"));
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    const [row] = await handle.db.execute(sql.raw("select 2 as v"));
    expect(row?.v).toBe(2);
    expect(proxy.maxInFlight()).toBe(1);
  });
});
