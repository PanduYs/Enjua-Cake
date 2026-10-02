import "server-only";

import { getEnv } from "@/server/env";

import { MidtransPaymentProvider } from "./midtrans-provider";
import { MockPaymentProvider } from "./mock-provider";
import type { PaymentProvider } from "./types";

export type { PaymentProvider } from "./types";

const globalForPayments = globalThis as unknown as { __enjuaPaymentProvider?: PaymentProvider };

/**
 * Selects the configured gateway adapter (TD-08): "mock" for development/test,
 * "midtrans" (sandbox or production per PAYMENT_ENV) once credentials exist.
 */
export function getPaymentProvider(): PaymentProvider {
  if (!globalForPayments.__enjuaPaymentProvider) {
    const env = getEnv();
    switch (env.PAYMENT_PROVIDER) {
      case "mock": {
        if (!env.MOCK_PAYMENT_WEBHOOK_SECRET) {
          throw new Error("MOCK_PAYMENT_WEBHOOK_SECRET is required when PAYMENT_PROVIDER=mock");
        }
        globalForPayments.__enjuaPaymentProvider = new MockPaymentProvider({ webhookSecret: env.MOCK_PAYMENT_WEBHOOK_SECRET });
        break;
      }
      case "midtrans":
        globalForPayments.__enjuaPaymentProvider = new MidtransPaymentProvider({ serverKey: env.MIDTRANS_SERVER_KEY!, environment: env.PAYMENT_ENV });
        break;
    }
  }
  return globalForPayments.__enjuaPaymentProvider!;
}

/** The mock adapter when configured, for the development payment simulator; otherwise null. */
export function getMockPaymentProvider(): MockPaymentProvider | null {
  const provider = getPaymentProvider();
  // Name check, not instanceof: the singleton may come from another server chunk.
  return provider.name === "mock" ? (provider as MockPaymentProvider) : null;
}
