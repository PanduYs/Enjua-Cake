/**
 * Midtrans SANDBOX smoke test (PRD §60 / plan §35 "Payment sandbox").
 * BLOCKED until a sandbox server key exists. Never runs in CI. Usage:
 *
 *   PAYMENT_ENV=sandbox MIDTRANS_SERVER_KEY=<from the Midtrans sandbox dashboard, via your shell/secret manager> \
 *     npm run midtrans:smoke
 *
 * It creates a small QRIS charge on the SANDBOX, reads its status back, verifies
 * our notification-signature check against Midtrans's documented formula, and
 * cancels the charge. Refuses production keys. The key is never printed.
 * Completing a payment (simulator) and receiving the webhook on a public URL is a
 * manual step documented in docs/DEPLOYMENT.md.
 */
import { randomUUID } from "node:crypto";

import { midtransSignature, MidtransPaymentProvider } from "@/server/payments/midtrans-provider";

async function main() {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key) {
    console.error("BLOCKED: MIDTRANS_SERVER_KEY (sandbox) is not set.");
    process.exit(3);
  }
  if (process.env.PAYMENT_ENV !== "sandbox" || !key.startsWith("SB-")) {
    console.error("Refusing: this smoke test only runs with PAYMENT_ENV=sandbox and a sandbox (SB-) key.");
    process.exit(2);
  }
  const provider = new MidtransPaymentProvider({ serverKey: key, environment: "sandbox" });
  const transactionId = `smoke-${randomUUID()}`;
  const qr = await provider.createQris({ transactionId, amount: 1000, expiresAt: new Date(Date.now() + 15 * 60_000) });
  console.log(`charge ok: reference=${qr.providerReference} qr_string_length=${qr.qrString.length} expires=${qr.expiresAt.toISOString()}`);
  const status = await provider.getTransactionStatus(qr.providerReference);
  console.log(`status ok: ${status?.status} amount=${status?.amount}`);
  if (status?.status !== "PENDING" || status.amount !== 1000) throw new Error("unexpected sandbox status");

  const body = { order_id: transactionId, status_code: "201", gross_amount: "1000.00", transaction_status: "pending", transaction_id: "smoke" };
  const signed = { ...body, signature_key: midtransSignature(body.order_id, body.status_code, body.gross_amount, key) };
  const parsed = await provider.parseAndVerifyWebhook(new Request("http://localhost/api/webhooks/payments/midtrans", { method: "POST", body: JSON.stringify(signed) }));
  console.log(`signature check: ${parsed.valid ? "ok" : "FAILED"}`);
  await provider.cancelQris(qr.providerReference);
  console.log("cancelled. Sandbox smoke test passed.");
}

main().catch((error: unknown) => {
  console.error(`Sandbox smoke test FAILED: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
});
