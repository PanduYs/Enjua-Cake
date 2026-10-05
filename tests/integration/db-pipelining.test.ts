import net from "node:net";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, inject } from "vitest";

import { createDatabase, type DatabaseHandle } from "@/server/db/client";

/**
 * Supavisor (transaction mode) answers only the first of several queries written
 * back-to-back on one connection; the rest hang. This proxy sits between the app's
 * client and Postgres and records the most queries ever in flight on one connection:
 * a query starts with Parse ('P') or Query ('Q') and ends with ReadyForQuery ('Z').
 */
function startCountingProxy(target: URL) {
  let maxInFlight = 0;
  const sockets = new Set<net.Socket>();
  const server = net.createServer((client) => {
    const upstream = net.connect(Number(target.port || 5432), target.hostname);
    sockets.add(client).add(upstream);
    let inFlight = 0;
    let startupDone = false;
    let fromClient = Buffer.alloc(0);
    let fromServer = Buffer.alloc(0);
    client.on("data", (chunk) => {
      upstream.write(chunk);
      fromClient = Buffer.concat([fromClient, chunk]);
      for (;;) {
        if (!startupDone) {
          // Untyped startup packet (SSLRequest is never sent: the test URL has no sslmode).
          if (fromClient.length < 4 || fromClient.length < fromClient.readInt32BE(0)) break;
          fromClient = fromClient.subarray(fromClient.readInt32BE(0));
          startupDone = true;
          continue;
        }
        if (fromClient.length < 5 || fromClient.length < fromClient.readInt32BE(1) + 1) break;
        if (fromClient[0] === 0x50 || fromClient[0] === 0x51) maxInFlight = Math.max(maxInFlight, ++inFlight);
        fromClient = fromClient.subarray(fromClient.readInt32BE(1) + 1);
      }
    });
    upstream.on("data", (chunk) => {
      client.write(chunk);
      fromServer = Buffer.concat([fromServer, chunk]);
      for (;;) {
        if (fromServer.length < 5 || fromServer.length < fromServer.readInt32BE(1) + 1) break;
        if (fromServer[0] === 0x5a && inFlight > 0) inFlight--;
        fromServer = fromServer.subarray(fromServer.readInt32BE(1) + 1);
      }
    });
    for (const s of [client, upstream]) {
      s.on("error", () => {});
      s.on("close", () => (client.destroy(), upstream.destroy()));
    }
  });
  return {
    listen: () => new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as net.AddressInfo).port))),
    maxInFlight: () => maxInFlight,
    close: () => {
      for (const s of sockets) s.destroy();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

let proxy: ReturnType<typeof startCountingProxy>;
let handle: DatabaseHandle;

beforeAll(async () => {
  const target = new URL(inject("databaseUrl"));
  proxy = startCountingProxy(target);
  const port = await proxy.listen();
  const viaProxy = new URL(target);
  viaProxy.hostname = "127.0.0.1";
  viaProxy.port = String(port);
  // Same small pool as Vercel Preview (DATABASE_POOL_MAX=2) so queries must queue.
  handle = createDatabase(viaProxy.toString(), { max: 2, silenceNotices: true });
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
