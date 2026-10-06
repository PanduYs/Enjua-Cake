/**
 * Usage: npm run payments:reconcile -- [--days=7]
 * Read-only report of QRIS transactions the provider reports as PAID but the database
 * does not (missed webhooks). Uses the configured PAYMENT_PROVIDER credentials.
 * Exit code: 0 all checked and consistent; 1 a mismatch, or a transaction whose provider
 * status could not be read (wrong key/environment, provider down); 2 the run failed.
 */
import { createDatabase } from "@/server/db/client";
import { isUnchecked, reconcilePayments, summarizeReconcile } from "@/server/ops/reconcile";
import { getPaymentProvider } from "@/server/payments";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const days = Number(process.argv.find((a) => a.startsWith("--days="))?.split("=")[1] ?? "7");
  const handle = createDatabase(url, { max: 1, silenceNotices: true });
  try {
    const rows = await reconcilePayments(handle.db, getPaymentProvider(), { since: new Date(Date.now() - days * 86_400_000) });
    for (const r of rows) {
      const label = r.mismatch ? "MISMATCH" : isUnchecked(r) ? "UNCHECKED" : "ok";
      console.log(`${label.padEnd(9)} ${r.orderNumber} ${r.transactionId} db=${r.dbStatus} provider=${r.providerStatus} amount=${r.amount}`);
    }
    const summary = summarizeReconcile(rows);
    console.log(`\n${rows.length} transaction(s): ${summary.checked} checked, ${summary.mismatches} mismatch(es), ${summary.unchecked} unchecked.`);
    if (summary.mismatches) console.log("Resend the payment notification from the provider dashboard; the verified webhook will apply it (or open a Payment Exception).");
    if (summary.unchecked) {
      console.log("Provider status could not be read for the UNCHECKED transaction(s): check the server key and PAYMENT_ENV, then run again. The report is incomplete.");
    }
    process.exitCode = summary.exitCode;
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "reconcile failed");
  process.exit(2);
});
