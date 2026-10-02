import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

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

export const MOCK_SIGNATURE_HEADER = "x-mock-signature";

const webhookPayloadSchema = z.object({
  eventId: z.string().min(1),
  reference: z.string().min(1),
  status: z.enum(["PENDING", "PAID", "FAILED", "EXPIRED"]),
  amount: z.number().int().positive(),
  paidAt: z.iso.datetime().nullable(),
});

interface MockTransaction {
  providerReference: string;
  transactionId: string;
  amount: number;
  expiresAt: Date;
  status: ProviderPaymentStatus;
  paidAt: Date | null;
}

export interface MockProviderOptions {
  webhookSecret: string;
  now?: () => Date;
}

/**
 * Development/test gateway (TD-08). Keeps transactions in memory and signs
 * simulated webhooks with HMAC-SHA256 so the real verification path is exercised.
 * Must never be used with PAYMENT_ENV=production (enforced in env.ts).
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  private readonly transactions = new Map<string, MockTransaction>();
  private readonly now: () => Date;

  constructor(private readonly options: MockProviderOptions) {
    if (options.webhookSecret.length < 16) {
      throw new PaymentProviderError("INVALID_INPUT", "Mock webhook secret must be at least 16 characters");
    }
    this.now = options.now ?? (() => new Date());
  }

  async createQris(input: CreateQrisInput): Promise<CreateQrisResult> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new PaymentProviderError("INVALID_INPUT", "Amount must be a positive integer (Rupiah)");
    }
    if (input.expiresAt.getTime() <= this.now().getTime()) {
      throw new PaymentProviderError("INVALID_INPUT", "expiresAt must be in the future");
    }
    const providerReference = `MOCK-${randomUUID()}`;
    this.transactions.set(providerReference, {
      providerReference,
      transactionId: input.transactionId,
      amount: input.amount,
      expiresAt: input.expiresAt,
      status: "PENDING",
      paidAt: null,
    });
    return {
      providerReference,
      qrString: `MOCKQRIS|${providerReference}|${input.amount}`,
      expiresAt: input.expiresAt,
    };
  }

  async getTransactionStatus(providerReference: string): Promise<ProviderTransactionStatus | null> {
    const tx = this.transactions.get(providerReference);
    if (!tx) return null;
    if (tx.status === "PENDING" && tx.expiresAt.getTime() <= this.now().getTime()) {
      tx.status = "EXPIRED";
    }
    return { providerReference, status: tx.status, amount: tx.amount, paidAt: tx.paidAt };
  }

  async parseAndVerifyWebhook(request: Request): Promise<WebhookParseResult> {
    const rawBody = await request.text();
    const payloadHash = sha256Hex(rawBody);
    const signature = request.headers.get(MOCK_SIGNATURE_HEADER);
    if (!signature) return { valid: false, reason: "MISSING_SIGNATURE", payloadHash };

    if (!constantTimeEqualHex(signature, this.sign(rawBody))) {
      return { valid: false, reason: "INVALID_SIGNATURE", payloadHash };
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return { valid: false, reason: "MALFORMED_PAYLOAD", payloadHash };
    }
    const parsed = webhookPayloadSchema.safeParse(json);
    if (!parsed.success) return { valid: false, reason: "MALFORMED_PAYLOAD", payloadHash };

    const { eventId, reference, status, amount, paidAt } = parsed.data;
    return {
      valid: true,
      event: {
        providerEventKey: eventId,
        providerReference: reference,
        status,
        amount,
        paidAt: paidAt ? new Date(paidAt) : null,
        payloadHash,
      },
    };
  }

  /**
   * Simulates the customer paying (or failing) and returns the signed webhook
   * request the gateway would send. Development/test helper only.
   */
  simulatePayment(
    providerReference: string,
    outcome: "PAID" | "FAILED" | "EXPIRED",
    options: { amount?: number; eventId?: string; url?: string } = {},
  ): Request {
    const tx = this.transactions.get(providerReference);
    if (!tx) throw new PaymentProviderError("NOT_FOUND", `Unknown mock transaction ${providerReference}`);
    tx.status = outcome;
    tx.paidAt = outcome === "PAID" ? this.now() : null;

    const body = JSON.stringify({
      eventId: options.eventId ?? `evt_${randomUUID()}`,
      reference: providerReference,
      status: outcome,
      amount: options.amount ?? tx.amount,
      paidAt: tx.paidAt?.toISOString() ?? null,
    });
    return new Request(options.url ?? "http://localhost/api/webhooks/payments/mock", {
      method: "POST",
      headers: { "content-type": "application/json", [MOCK_SIGNATURE_HEADER]: this.sign(body) },
      body,
    });
  }

  private sign(rawBody: string): string {
    return createHmac("sha256", this.options.webhookSecret).update(rawBody).digest("hex");
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function constantTimeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
