/**
 * Usage: npm run payments:reconcile -- [--days=7]
 * Read-only report of QRIS transactions the provider reports as PAID but the database
 * does not (missed webhooks). Uses the configured PAYMENT_PROVIDER credentials.
 */
import { createDatabase } from "@/server/db/client";
import { reconcilePayments } from "@/server/ops/reconcile";
import { getPaymentProvider } from "@/server/payments";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const days = Number(process.argv.find((a) => a.startsWith("--days="))?.split("=")[1] ?? "7");
  const handle = createDatabase(url, { max: 1, silenceNotices: true });
  try {
    const rows = await reconcilePayments(handle.db, getPaymentProvider(), { since: new Date(Date.now() - days * 86_400_000) });
    const mismatches = rows.filter((r) => r.mismatch);
    for (const r of rows) console.log(`${r.mismatch ? "MISMATCH" : "ok      "} ${r.orderNumber} ${r.transactionId} db=${r.dbStatus} provider=${r.providerStatus} amount=${r.amount}`);
    console.log(`\n${rows.length} transaction(s) checked, ${mismatches.length} mismatch(es).`);
    if (mismatches.length) console.log("Resend the payment notification from the provider dashboard; the verified webhook will apply it (or open a Payment Exception).");
    process.exitCode = mismatches.length ? 1 : 0;
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "reconcile failed");
  process.exit(2);
});
