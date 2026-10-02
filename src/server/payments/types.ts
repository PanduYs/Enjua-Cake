/**
 * Provider-agnostic payment gateway contract (IMPLEMENTATION-PLAN §14, TD-08, FD-49).
 * Business logic depends only on this interface; each gateway is one adapter.
 */
export type ProviderPaymentStatus = "PENDING" | "PAID" | "FAILED" | "EXPIRED";

export interface CreateQrisInput {
  /** Our payment_transactions.id — used to correlate provider callbacks. */
  transactionId: string;
  /** Integer Rupiah, > 0. */
  amount: number;
  /** Requested QR expiry; the provider may shorten it. */
  expiresAt: Date;
}

export interface CreateQrisResult {
  providerReference: string;
  qrString: string;
  expiresAt: Date;
}

export interface VerifiedWebhookEvent {
  /** Unique per provider event — the idempotency key (EC-05). */
  providerEventKey: string;
  providerReference: string;
  status: ProviderPaymentStatus;
  amount: number;
  paidAt: Date | null;
  payloadHash: string;
}

export type WebhookParseResult =
  | { valid: true; event: VerifiedWebhookEvent }
  | { valid: false; reason: "MISSING_SIGNATURE" | "INVALID_SIGNATURE" | "MALFORMED_PAYLOAD"; payloadHash: string | null };

export interface ProviderTransactionStatus {
  providerReference: string;
  status: ProviderPaymentStatus;
  amount: number;
  paidAt: Date | null;
}

export interface PaymentProvider {
  readonly name: string;
  createQris(input: CreateQrisInput): Promise<CreateQrisResult>;
  /** Verifies authenticity from the raw request; never trusts unsigned data (BR-15). */
  parseAndVerifyWebhook(request: Request): Promise<WebhookParseResult>;
  /** Defense in depth: re-check status with the provider before applying a webhook. */
  getTransactionStatus(providerReference: string): Promise<ProviderTransactionStatus | null>;
  /** Optional: invalidate a replaced pending QR at the provider (TD-20). Best effort. */
  cancelQris?(providerReference: string): Promise<void>;
}

export class PaymentProviderError extends Error {
  constructor(
    public readonly code: "INVALID_INPUT" | "PROVIDER_UNAVAILABLE" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

/** Name-based check: bundlers may duplicate this module across chunks (see isStorageKeyError). */
export function isPaymentProviderError(error: unknown): error is PaymentProviderError {
  return error instanceof Error && error.name === "PaymentProviderError";
}
