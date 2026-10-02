import { describe, expect, it } from "vitest";

import { createFixedClock } from "@/server/clock";
import { MOCK_SIGNATURE_HEADER, MockPaymentProvider } from "@/server/payments/mock-provider";
import { PaymentProviderError } from "@/server/payments/types";

const SECRET = "test-webhook-secret-123456";

function setup() {
  const clock = createFixedClock(new Date("2026-10-02T08:00:00Z"));
  const provider = new MockPaymentProvider({ webhookSecret: SECRET, now: () => clock.now() });
  const expiresAt = new Date("2026-10-02T08:28:00Z");
  return { clock, provider, expiresAt };
}

describe("MockPaymentProvider", () => {
  it("creates a QRIS transaction that starts PENDING", async () => {
    const { provider, expiresAt } = setup();
    const qr = await provider.createQris({ transactionId: "tx-1", amount: 150_000, expiresAt });
    expect(qr.providerReference).toMatch(/^MOCK-/);
    expect(qr.qrString).toContain("150000");
    await expect(provider.getTransactionStatus(qr.providerReference)).resolves.toMatchObject({ status: "PENDING", amount: 150_000 });
  });

  it("rejects invalid amounts and past expiry", async () => {
    const { provider, expiresAt } = setup();
    await expect(provider.createQris({ transactionId: "t", amount: 0, expiresAt })).rejects.toBeInstanceOf(PaymentProviderError);
    await expect(provider.createQris({ transactionId: "t", amount: 10.5, expiresAt })).rejects.toBeInstanceOf(PaymentProviderError);
    await expect(
      provider.createQris({ transactionId: "t", amount: 1000, expiresAt: new Date("2026-10-02T07:00:00Z") }),
    ).rejects.toBeInstanceOf(PaymentProviderError);
  });

  it("produces signed webhooks that verify, and status agrees with the webhook", async () => {
    const { provider, expiresAt } = setup();
    const qr = await provider.createQris({ transactionId: "tx-1", amount: 62_778, expiresAt });
    const request = provider.simulatePayment(qr.providerReference, "PAID", { eventId: "evt-1" });
    const result = await provider.parseAndVerifyWebhook(request);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.event).toMatchObject({ providerEventKey: "evt-1", providerReference: qr.providerReference, status: "PAID", amount: 62_778 });
    expect(result.event.paidAt?.toISOString()).toBe("2026-10-02T08:00:00.000Z");
    await expect(provider.getTransactionStatus(qr.providerReference)).resolves.toMatchObject({ status: "PAID" });
  });

  it("rejects missing, forged, and tampered signatures", async () => {
    const { provider, expiresAt } = setup();
    const qr = await provider.createQris({ transactionId: "tx-1", amount: 1000, expiresAt });
    const genuine = provider.simulatePayment(qr.providerReference, "PAID");
    const body = await genuine.clone().text();

    const unsigned = new Request("http://x", { method: "POST", body });
    expect(await provider.parseAndVerifyWebhook(unsigned)).toMatchObject({ valid: false, reason: "MISSING_SIGNATURE" });

    const forged = new Request("http://x", { method: "POST", body, headers: { [MOCK_SIGNATURE_HEADER]: "0".repeat(64) } });
    expect(await provider.parseAndVerifyWebhook(forged)).toMatchObject({ valid: false, reason: "INVALID_SIGNATURE" });

    const tampered = new Request("http://x", {
      method: "POST",
      body: body.replace('"amount":1000', '"amount":1'),
      headers: { [MOCK_SIGNATURE_HEADER]: genuine.headers.get(MOCK_SIGNATURE_HEADER)! },
    });
    expect(await provider.parseAndVerifyWebhook(tampered)).toMatchObject({ valid: false, reason: "INVALID_SIGNATURE" });
  });

  it("reports PENDING transactions as EXPIRED after their expiry", async () => {
    const { clock, provider, expiresAt } = setup();
    const qr = await provider.createQris({ transactionId: "tx-1", amount: 1000, expiresAt });
    clock.set(new Date("2026-10-02T08:28:00Z"));
    await expect(provider.getTransactionStatus(qr.providerReference)).resolves.toMatchObject({ status: "EXPIRED" });
  });

  it("returns null for unknown references and refuses short secrets", async () => {
    const { provider } = setup();
    await expect(provider.getTransactionStatus("MOCK-unknown")).resolves.toBeNull();
    expect(() => new MockPaymentProvider({ webhookSecret: "short" })).toThrow(PaymentProviderError);
  });
});
