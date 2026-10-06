import { describe, expect, it } from "vitest";

import { mapMidtransStatus, midtransSignature, MidtransPaymentProvider, parseMidtransAmount, parseMidtransTime } from "@/server/payments/midtrans-provider";
import { PaymentProviderError } from "@/server/payments/types";

// Test-only fake key; Midtrans is never called (fetch is stubbed).
const KEY = "SB-Mid-server-TEST-ONLY-not-a-real-key";
const now = new Date("2026-10-02T03:00:00Z"); // 10:00 WIB

function setup(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchStub = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  }) as unknown as typeof fetch;
  const provider = new MidtransPaymentProvider({ serverKey: KEY, environment: "sandbox", fetch: fetchStub, now: () => now });
  return { provider, calls };
}

function notification(over: Record<string, string> = {}) {
  const base = { order_id: "tx-1", status_code: "200", gross_amount: "62778.00", transaction_status: "settlement", transaction_id: "mid-123", settlement_time: "2026-10-02 10:05:00", ...over };
  return { ...base, signature_key: over.signature_key ?? midtransSignature(base.order_id, base.status_code, base.gross_amount, KEY) };
}
const post = (body: unknown) => new Request("http://localhost/api/webhooks/payments/midtrans", { method: "POST", body: JSON.stringify(body) });

describe("Midtrans adapter (TD-08)", () => {
  it("maps statuses conservatively", () => {
    expect(mapMidtransStatus("settlement")).toBe("PAID");
    expect(mapMidtransStatus("capture", "accept")).toBe("PAID");
    expect(mapMidtransStatus("capture", "challenge")).toBe("PENDING");
    expect(mapMidtransStatus("pending")).toBe("PENDING");
    expect(mapMidtransStatus("expire")).toBe("EXPIRED");
    for (const s of ["deny", "cancel", "failure"]) expect(mapMidtransStatus(s)).toBe("FAILED");
    expect(mapMidtransStatus("refund")).toBe("PENDING");
  });

  it("parses amounts and WIB times", () => {
    expect(parseMidtransAmount("62778.00")).toBe(62_778);
    expect(parseMidtransAmount("62778")).toBe(62_778);
    expect(parseMidtransAmount("62778.50")).toBeNull();
    expect(parseMidtransTime("2026-10-02 10:05:00")?.toISOString()).toBe("2026-10-02T03:05:00.000Z");
    expect(parseMidtransTime("garbage")).toBeNull();
  });

  it("charges QRIS on the sandbox with Basic auth, our transaction id, and an expiry that never exceeds ours", async () => {
    const { provider, calls } = setup([{ status: 201, body: { status_code: "201", order_id: "tx-1", qr_string: "00020101021226...", expiry_time: "2026-10-02 10:28:00" } }]);
    const result = await provider.createQris({ transactionId: "tx-1", amount: 62_778, expiresAt: new Date("2026-10-02T03:28:00Z") });
    expect(result).toEqual({ providerReference: "tx-1", qrString: "00020101021226...", expiresAt: new Date("2026-10-02T03:28:00Z") });
    expect(calls[0]!.url).toBe("https://api.sandbox.midtrans.com/v2/charge");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(`${KEY}:`).toString("base64")}`);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      payment_type: "qris",
      transaction_details: { order_id: "tx-1", gross_amount: 62_778 },
      custom_expiry: { order_time: "2026-10-02 10:00:00 +0700", expiry_duration: 28, unit: "minute" },
    });
  });

  it("treats rejected charges and 5xx as provider errors (EC-13)", async () => {
    const rejected = setup([{ status: 200, body: { status_code: "400", status_message: "bad" } }]);
    await expect(rejected.provider.createQris({ transactionId: "t", amount: 1000, expiresAt: new Date("2026-10-02T03:20:00Z") })).rejects.toBeInstanceOf(PaymentProviderError);
    const down = setup([{ status: 503, body: {} }]);
    await expect(down.provider.getTransactionStatus("t")).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("reads transaction status; 404 → unknown", async () => {
    const { provider } = setup([
      { body: { status_code: "200", order_id: "tx-1", gross_amount: "62778.00", transaction_status: "settlement", settlement_time: "2026-10-02 10:05:00" } },
      { body: { status_code: "404", status_message: "not found" } },
    ]);
    expect(await provider.getTransactionStatus("tx-1")).toEqual({ providerReference: "tx-1", status: "PAID", amount: 62_778, paidAt: new Date("2026-10-02T03:05:00Z") });
    expect(await provider.getTransactionStatus("nope")).toBeNull();
  });

  it("only 404 means unknown: other replies without a transaction status are retryable provider errors", async () => {
    // A webhook records its event once it has a status answer, so treating 401 (key or
    // environment mismatch) or 429 as "unknown" would answer 200 and drop a real payment.
    const { provider } = setup([
      { status: 401, body: { status_code: "401", status_message: "Access denied, please check client or server key" } },
      { status: 429, body: { status_code: "429", status_message: "Too many requests" } },
      { status: 404, body: { status_code: "404", status_message: "Transaction doesn't exist." } },
      { body: { status_code: "407", order_id: "tx-2", gross_amount: "1000.00", transaction_status: "expire" } },
    ]);
    await expect(provider.getTransactionStatus("tx-1")).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    await expect(provider.getTransactionStatus("tx-1")).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(await provider.getTransactionStatus("nope")).toBeNull();
    expect(await provider.getTransactionStatus("tx-2")).toEqual({ providerReference: "tx-2", status: "EXPIRED", amount: 1_000, paidAt: null });
  });

  it("verifies notification signatures (SHA-512) and rejects tampering", async () => {
    const { provider } = setup([]);
    const ok = await provider.parseAndVerifyWebhook(post(notification()));
    expect(ok).toMatchObject({ valid: true, event: { providerReference: "tx-1", status: "PAID", amount: 62_778, providerEventKey: "mid-123:settlement:" } });

    const tampered = { ...notification(), gross_amount: "1.00" };
    expect(await provider.parseAndVerifyWebhook(post(tampered))).toMatchObject({ valid: false, reason: "INVALID_SIGNATURE" });
    const unsigned: Record<string, string> = { ...notification() };
    delete unsigned.signature_key;
    expect(await provider.parseAndVerifyWebhook(post(unsigned))).toMatchObject({ valid: false, reason: "MISSING_SIGNATURE" });
    expect(await provider.parseAndVerifyWebhook(new Request("http://x", { method: "POST", body: "not json" }))).toMatchObject({ valid: false, reason: "MALFORMED_PAYLOAD" });
  });

  it("requires a server key", () => {
    expect(() => new MidtransPaymentProvider({ serverKey: "", environment: "sandbox" })).toThrow(PaymentProviderError);
  });
});
