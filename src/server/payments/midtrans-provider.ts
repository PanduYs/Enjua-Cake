import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import {
  PaymentProviderError,
  type CreateQrisInput,
  type CreateQrisResult,
  type PaymentProvider,
  type ProviderPaymentStatus,
  type ProviderTransactionStatus,
  type WebhookParseResult,
} from "./types";

/**
 * Midtrans Core API adapter (TD-08: primary candidate). QRIS via `/v2/charge`
 * with `payment_type: "qris"`; notifications verified with
 * signature_key = SHA-512(order_id + status_code + gross_amount + server key),
 * then re-checked through `/v2/{order_id}/status` by the webhook service.
 * Our payment_transactions.id is sent as Midtrans `order_id` (one per transaction,
 * so DP and remaining payments are separate Midtrans transactions).
 *
 * Credentials come only from the environment; nothing here is production data.
 */
export interface MidtransOptions {
  serverKey: string;
  environment: "sandbox" | "production";
  fetch?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
}

const BASE_URL = { sandbox: "https://api.sandbox.midtrans.com", production: "https://api.midtrans.com" } as const;

const notificationSchema = z.object({
  order_id: z.string().min(1),
  status_code: z.string().min(1),
  gross_amount: z.string().min(1),
  signature_key: z.string().min(1),
  transaction_status: z.string().min(1),
  transaction_id: z.string().min(1),
  fraud_status: z.string().optional(),
  settlement_time: z.string().optional(),
});

const statusSchema = z.object({
  status_code: z.string(),
  order_id: z.string().optional(),
  gross_amount: z.string().optional(),
  transaction_status: z.string().optional(),
  fraud_status: z.string().optional(),
  settlement_time: z.string().optional(),
});

const chargeSchema = z.object({
  status_code: z.string(),
  status_message: z.string().optional(),
  order_id: z.string().optional(),
  qr_string: z.string().optional(),
  expiry_time: z.string().optional(),
});

/** Midtrans → provider-agnostic status. Capture counts only when fraud check accepted. */
export function mapMidtransStatus(transactionStatus: string, fraudStatus?: string): ProviderPaymentStatus {
  switch (transactionStatus) {
    case "settlement":
      return "PAID";
    case "capture":
      return !fraudStatus || fraudStatus === "accept" ? "PAID" : "PENDING";
    case "deny":
    case "cancel":
    case "failure":
      return "FAILED";
    case "expire":
      return "EXPIRED";
    default:
      return "PENDING";
  }
}

/** "225000.00" → 225000; rejects non-integer Rupiah. */
export function parseMidtransAmount(value: string): number | null {
  if (!/^\d+(\.0+)?$/.test(value)) return null;
  return Number(value.split(".")[0]);
}

/** Midtrans times are WIB "yyyy-MM-dd HH:mm:ss". */
export function parseMidtransTime(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return null;
  return new Date(`${value.replace(" ", "T")}+07:00`);
}

function formatMidtransTime(date: Date): string {
  const wib = new Date(date.getTime() + 7 * 3600_000).toISOString();
  return `${wib.slice(0, 10)} ${wib.slice(11, 19)} +0700`;
}

export function midtransSignature(orderId: string, statusCode: string, grossAmount: string, serverKey: string): string {
  return createHash("sha512").update(`${orderId}${statusCode}${grossAmount}${serverKey}`).digest("hex");
}

export class MidtransPaymentProvider implements PaymentProvider {
  readonly name = "midtrans";
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly options: MidtransOptions) {
    if (!options.serverKey) throw new PaymentProviderError("INVALID_INPUT", "Midtrans server key is required");
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  private async call(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${BASE_URL[this.options.environment]}${path}`, {
        method: init.method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`${this.options.serverKey}:`).toString("base64")}`,
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
    } catch {
      throw new PaymentProviderError("PROVIDER_UNAVAILABLE", "Midtrans request failed");
    }
    if (response.status >= 500) throw new PaymentProviderError("PROVIDER_UNAVAILABLE", `Midtrans HTTP ${response.status}`);
    try {
      return await response.json();
    } catch {
      throw new PaymentProviderError("PROVIDER_UNAVAILABLE", "Midtrans returned a non-JSON response");
    }
  }

  async createQris(input: CreateQrisInput): Promise<CreateQrisResult> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new PaymentProviderError("INVALID_INPUT", "Amount must be a positive integer (Rupiah)");
    const now = this.now();
    const minutes = Math.floor((input.expiresAt.getTime() - now.getTime()) / 60_000);
    if (minutes < 1) throw new PaymentProviderError("INVALID_INPUT", "expiresAt must be at least one minute ahead");

    const raw = await this.call("/v2/charge", {
      method: "POST",
      body: {
        payment_type: "qris",
        transaction_details: { order_id: input.transactionId, gross_amount: input.amount },
        custom_expiry: { order_time: formatMidtransTime(now), expiry_duration: minutes, unit: "minute" },
      },
    });
    const parsed = chargeSchema.safeParse(raw);
    if (!parsed.success || parsed.data.status_code !== "201" || !parsed.data.qr_string) {
      throw new PaymentProviderError("PROVIDER_UNAVAILABLE", `Midtrans charge rejected: ${parsed.success ? parsed.data.status_message : "malformed"}`);
    }
    const providerExpiry = parseMidtransTime(parsed.data.expiry_time);
    return {
      providerReference: input.transactionId,
      qrString: parsed.data.qr_string,
      // Never later than what we asked for (reservation − buffer, TD-08).
      expiresAt: providerExpiry && providerExpiry < input.expiresAt ? providerExpiry : new Date(now.getTime() + minutes * 60_000),
    };
  }

  async getTransactionStatus(providerReference: string): Promise<ProviderTransactionStatus | null> {
    const raw = await this.call(`/v2/${encodeURIComponent(providerReference)}/status`, { method: "GET" });
    const parsed = statusSchema.safeParse(raw);
    if (!parsed.success) throw new PaymentProviderError("PROVIDER_UNAVAILABLE", "Malformed Midtrans status");
    if (parsed.data.status_code === "404" || !parsed.data.transaction_status || !parsed.data.gross_amount) return null;
    const amount = parseMidtransAmount(parsed.data.gross_amount);
    if (amount === null) throw new PaymentProviderError("PROVIDER_UNAVAILABLE", "Non-integer Midtrans amount");
    const status = mapMidtransStatus(parsed.data.transaction_status, parsed.data.fraud_status);
    return { providerReference, status, amount, paidAt: status === "PAID" ? parseMidtransTime(parsed.data.settlement_time) : null };
  }

  async cancelQris(providerReference: string): Promise<void> {
    await this.call(`/v2/${encodeURIComponent(providerReference)}/cancel`, { method: "POST" });
  }

  async parseAndVerifyWebhook(request: Request): Promise<WebhookParseResult> {
    const rawBody = await request.text();
    const payloadHash = createHash("sha256").update(rawBody).digest("hex");
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return { valid: false, reason: "MALFORMED_PAYLOAD", payloadHash };
    }
    const parsed = notificationSchema.safeParse(json);
    if (!parsed.success) {
      const hasSignature = typeof json === "object" && json !== null && "signature_key" in json;
      return { valid: false, reason: hasSignature ? "MALFORMED_PAYLOAD" : "MISSING_SIGNATURE", payloadHash };
    }
    const n = parsed.data;
    const expected = Buffer.from(midtransSignature(n.order_id, n.status_code, n.gross_amount, this.options.serverKey));
    const given = Buffer.from(n.signature_key);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { valid: false, reason: "INVALID_SIGNATURE", payloadHash };

    const amount = parseMidtransAmount(n.gross_amount);
    if (amount === null) return { valid: false, reason: "MALFORMED_PAYLOAD", payloadHash };
    const status = mapMidtransStatus(n.transaction_status, n.fraud_status);
    return {
      valid: true,
      event: {
        // Midtrans has no event id; one key per (transaction, status) makes retries idempotent.
        providerEventKey: `${n.transaction_id}:${n.transaction_status}:${n.fraud_status ?? ""}`,
        providerReference: n.order_id,
        status,
        amount,
        paidAt: status === "PAID" ? parseMidtransTime(n.settlement_time) : null,
        payloadHash,
      },
    };
  }
}
