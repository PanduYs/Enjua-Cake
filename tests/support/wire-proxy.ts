import net from "node:net";

import { createDatabase, type DatabaseHandle } from "@/server/db/client";

/**
 * TCP proxy between the app's database client and PostgreSQL that reads the wire protocol:
 * - the most queries ever in flight on one connection (a query starts with Parse 'P' or
 *   Query 'Q' and ends with ReadyForQuery 'Z') — transaction-mode poolers (Supavisor) hang
 *   on pipelined queries;
 * - the SQL text of every statement, so tests can assert which round trips a code path makes.
 */
export function startWireProxy(target: URL) {
  let maxInFlight = 0;
  let statements: string[] = [];
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
        const type = fromClient[0];
        const body = fromClient.subarray(5, fromClient.readInt32BE(1) + 1);
        if (type === 0x50 || type === 0x51) {
          maxInFlight = Math.max(maxInFlight, ++inFlight);
          // Parse: statement name\0 query\0 …; Query: query\0.
          const text = type === 0x50 ? body.subarray(body.indexOf(0) + 1) : body;
          statements.push(text.subarray(0, text.indexOf(0)).toString("utf8").replace(/\s+/g, " ").trim());
        }
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
    /** Statements sent since the last call (and clears the log). */
    takeStatements: () => {
      const taken = statements;
      statements = [];
      return taken;
    },
    close: () => {
      for (const s of sockets) s.destroy();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** A database handle whose traffic goes through a new wire proxy. */
export async function openProxiedDatabase(databaseUrl: string, max: number): Promise<{ handle: DatabaseHandle; proxy: ReturnType<typeof startWireProxy> }> {
  const target = new URL(databaseUrl);
  const proxy = startWireProxy(target);
  const port = await proxy.listen();
  const viaProxy = new URL(target);
  viaProxy.hostname = "127.0.0.1";
  viaProxy.port = String(port);
  return { handle: createDatabase(viaProxy.toString(), { max, silenceNotices: true }), proxy };
}

/** Statements that write or open a transaction (what a pure read must not send). */
export const isWriteOrTransaction = (statement: string) => /^(begin|commit|rollback|insert|update|delete)\b/i.test(statement);
