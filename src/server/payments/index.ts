import "server-only";

import { getEnv } from "@/server/env";

import { MockPaymentProvider } from "./mock-provider";
import type { PaymentProvider } from "./types";

export type { PaymentProvider } from "./types";

const globalForPayments = globalThis as unknown as { __enjuaPaymentProvider?: PaymentProvider };

/**
 * Selects the configured gateway adapter. Phase 1 implements only "mock";
 * the production adapter is added in Phase 5 after provider onboarding (TD-08).
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
    }
  }
  return globalForPayments.__enjuaPaymentProvider!;
}
