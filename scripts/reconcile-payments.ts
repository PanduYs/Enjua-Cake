/**
 * Usage: npm run payments:reconcile -- [--days=7] [--allow-empty]
 * Read-only report of QRIS transactions the provider reports as PAID but the database
 * does not (missed webhooks). Uses the configured PAYMENT_PROVIDER credentials.
 * Exit code: 0 all checked and consistent; 1 a mismatch, a transaction whose provider
 * status could not be read (wrong key/environment, provider down), or no transaction in
 * the window (pass --allow-empty when an empty window is expected, e.g. a quiet day);
 * 2 the run failed (safe diagnostics only: error codes and messages, secrets redacted).
 */
import { createDatabase } from "@/server/db/client";
import { describeDatabaseTarget, describeFailure, isUnchecked, reconcilePayments, secretsFromEnv, summarizeReconcile } from "@/server/ops/reconcile";
import { getPaymentProvider } from "@/server/payments";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const days = Number(process.argv.find((a) => a.startsWith("--days="))?.split("=")[1] ?? "7");
  if (!Number.isFinite(days) || days <= 0) throw new Error("--days must be a positive number");
  const allowEmpty = process.argv.includes("--allow-empty");
  const handle = createDatabase(url, { max: 1, silenceNotices: true });
  try {
    const provider = getPaymentProvider();
    console.log(`database: ${describeDatabaseTarget(url)}, provider: ${provider.name}, window: last ${days} day(s)\n`);
    const rows = await reconcilePayments(handle.db, provider, { since: new Date(Date.now() - days * 86_400_000) });
    for (const r of rows) {
      const label = r.mismatch ? "MISMATCH" : isUnchecked(r) ? "UNCHECKED" : "ok";
      console.log(`${label.padEnd(9)} ${r.orderNumber} ${r.transactionId} db=${r.dbStatus} provider=${r.providerStatus} amount=${r.amount}`);
    }
    const summary = summarizeReconcile(rows, { allowEmpty });
    console.log(`\n${rows.length} transaction(s): ${summary.checked} checked, ${summary.mismatches} mismatch(es), ${summary.unchecked} unchecked.`);
    if (summary.mismatches) console.log("Resend the payment notification from the provider dashboard; the verified webhook will apply it (or open a Payment Exception).");
    if (summary.unchecked) {
      console.log("Provider status could not be read for the UNCHECKED transaction(s): check the server key and PAYMENT_ENV, then run again. The report is incomplete.");
    }
    if (summary.empty) {
      console.log(
        allowEmpty
          ? "No unpaid QRIS transaction in the window; accepted because of --allow-empty."
          : "WARNING: no unpaid QRIS transaction in the window, so nothing was compared with the provider. Check that the database above is the intended one; if an empty window is expected, run again with --allow-empty.",
      );
    }
    process.exitCode = summary.exitCode;
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error("reconcile failed:");
  for (const line of describeFailure(error, secretsFromEnv(process.env))) console.error(`  ${line}`);
  process.exit(2);
});
