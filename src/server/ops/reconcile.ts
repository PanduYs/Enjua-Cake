import "server-only";

import { and, eq, inArray, isNotNull } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { orders, paymentTransactions } from "@/server/db/schema";
import { isPaymentProviderError, type PaymentProvider } from "@/server/payments/types";

/**
 * Payment reconciliation report (plan §38 runbook): compares QRIS transactions that
 * the database does not consider paid with the provider's status API (the source of
 * truth). Read-only — it changes nothing. A mismatch means a webhook was missed; the
 * fix is to have the provider resend the notification (or resend it from the
 * provider dashboard), which goes through the normal verified webhook path.
 */
export interface ReconcileRow {
  transactionId: string;
  orderNumber: string;
  amount: number;
  dbStatus: string;
  providerStatus: string;
  mismatch: boolean;
}

export async function reconcilePayments(db: Database, provider: PaymentProvider, options: { since?: Date } = {}): Promise<ReconcileRow[]> {
  const rows = await db
    .select({
      id: paymentTransactions.id,
      ref: paymentTransactions.providerReference,
      amount: paymentTransactions.amount,
      status: paymentTransactions.status,
      createdAt: paymentTransactions.createdAt,
      orderNumber: orders.orderNumber,
    })
    .from(paymentTransactions)
    .innerJoin(orders, eq(paymentTransactions.orderId, orders.id))
    .where(
      and(
        eq(paymentTransactions.method, "QRIS"),
        eq(paymentTransactions.provider, provider.name),
        isNotNull(paymentTransactions.providerReference),
        inArray(paymentTransactions.status, ["WAITING_PAYMENT", "FAILED", "EXPIRED", "VOIDED"]),
      ),
    );
  const out: ReconcileRow[] = [];
  for (const r of rows) {
    if (options.since && r.createdAt < options.since) continue;
    let providerStatus: string;
    try {
      providerStatus = (await provider.getTransactionStatus(r.ref!))?.status ?? "UNKNOWN";
    } catch (error) {
      providerStatus = isPaymentProviderError(error) ? "PROVIDER_UNAVAILABLE" : "ERROR";
    }
    out.push({ transactionId: r.id, orderNumber: r.orderNumber, amount: r.amount, dbStatus: r.status, providerStatus, mismatch: providerStatus === "PAID" });
  }
  return out;
}

/** Rows whose provider status could not be read are not "ok": the report is incomplete. */
export const isUnchecked = (row: ReconcileRow) => row.providerStatus === "PROVIDER_UNAVAILABLE" || row.providerStatus === "ERROR";

export interface ReconcileSummary {
  checked: number;
  mismatches: number;
  unchecked: number;
  /** No transaction was in the window: nothing was compared with the provider. */
  empty: boolean;
  /**
   * 0 = every transaction checked and none missed; 1 = a mismatch, an unchecked transaction, or
   * an empty window (a wrong DATABASE_URL looks exactly like that) unless `allowEmpty` says an
   * empty window is expected.
   */
  exitCode: 0 | 1;
}

export function summarizeReconcile(rows: ReconcileRow[], options: { allowEmpty?: boolean } = {}): ReconcileSummary {
  const mismatches = rows.filter((r) => r.mismatch).length;
  const unchecked = rows.filter(isUnchecked).length;
  const empty = rows.length === 0;
  return { checked: rows.length - unchecked, mismatches, unchecked, empty, exitCode: mismatches || unchecked || (empty && !options.allowEmpty) ? 1 : 0 };
}

/** Where the report reads from, without credentials: "host:port/database". */
export function describeDatabaseTarget(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    return `${url.hostname}:${url.port || "5432"}${url.pathname || "/"}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

const MAX_MESSAGE = 300;

/**
 * Safe diagnostics for a failed run: name, code and first message line of the error and each
 * cause (Drizzle hides the PostgreSQL error, e.g. 28P01, in `cause`). Every known secret value
 * and any credentials embedded in a URL are replaced before anything is printed.
 */
export function describeFailure(error: unknown, secrets: readonly (string | undefined)[]): string[] {
  const values = [...new Set(secrets.filter((s): s is string => typeof s === "string" && s.length >= 4))].sort((a, b) => b.length - a.length);
  const redact = (text: string) => {
    let out = text.replace(/([a-z][a-z0-9+.-]*:\/\/[^\s:/@]*):[^\s@]*@/gi, "$1:[redacted]@");
    for (const value of values) out = out.split(value).join("[redacted]");
    return out;
  };
  const lines: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current !== undefined && current !== null && depth < 4; depth++) {
    const label = depth === 0 ? "error" : "cause";
    if (current instanceof Error) {
      const code = (current as { code?: unknown }).code;
      const firstLine = current.message.split("\n")[0] ?? "";
      const message = firstLine.length > MAX_MESSAGE ? `${firstLine.slice(0, MAX_MESSAGE)}…` : firstLine;
      lines.push(redact(`${label}: ${current.name}${typeof code === "string" || typeof code === "number" ? ` [${code}]` : ""}: ${message}`));
      current = (current as { cause?: unknown }).cause;
    } else {
      lines.push(`${label}: ${typeof current === "string" ? redact(current.slice(0, MAX_MESSAGE)) : "non-Error value"}`);
      break;
    }
  }
  return lines;
}

/** Values the script must never print: the configured credentials, raw and as they appear inside URLs. */
export function secretsFromEnv(env: NodeJS.ProcessEnv): string[] {
  const out = [env.DATABASE_URL, env.MIDTRANS_SERVER_KEY, env.AUTH_SECRET, env.CRON_SECRET, env.MOCK_PAYMENT_WEBHOOK_SECRET, env.STORAGE_ACCESS_KEY_ID, env.STORAGE_SECRET_ACCESS_KEY];
  if (env.MIDTRANS_SERVER_KEY) out.push(Buffer.from(`${env.MIDTRANS_SERVER_KEY}:`).toString("base64"));
  if (env.DATABASE_URL) {
    try {
      const password = new URL(env.DATABASE_URL).password;
      if (password) out.push(password, decodeURIComponent(password));
    } catch {
      // Unparseable: the whole value is already in the list.
    }
  }
  return out.filter((s): s is string => Boolean(s));
}
