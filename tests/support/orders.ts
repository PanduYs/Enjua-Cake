import { randomUUID } from "node:crypto";

import type { Database } from "@/server/db/client";
import { orders } from "@/server/db/schema";

type OrderInsert = typeof orders.$inferInsert;
type Executor = Pick<Database, "insert">;

/**
 * Minimal order row for capacity tests. Order creation proper (placeOrder) is
 * Phase 4; this only populates required columns.
 */
export async function insertTestOrder(db: Executor, overrides: Partial<OrderInsert> & Pick<OrderInsert, "pickupDate">) {
  const id = randomUUID();
  await db.insert(orders).values({
    orderNumber: `TEST-${id.slice(0, 8)}`,
    trackingTokenHash: `hash-${id}`,
    source: "WEBSITE",
    customerName: "Test",
    customerPhone: "+6281234567890",
    orderDateEffective: "2026-10-01",
    subtotal: 100_000,
    grandTotal: 100_000,
    remainingAmount: 100_000,
    paymentStatus: "WAITING_PAYMENT",
    paymentMethod: "QRIS",
    paymentOption: "FULL",
    ...overrides,
  });
  return id;
}
