import "server-only";

import { randomInt } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/client";
import { uniqueViolationConstraint } from "@/server/db/errors";
import { orderItems, orders, paymentTransactions, products } from "@/server/db/schema";
import { paymentBreakdown, type PaymentBreakdown } from "@/server/domain/checkout/payment-rules";
import { effectiveOrderDate, evaluatePickupDate, maxPreorderDays, pickupWindow, type PickupDateReason } from "@/server/domain/checkout/pickup-date";
import { generateOrderNumber } from "@/server/domain/orders/order-number";
import type { IsoDate } from "@/server/domain/time/wib";
import { writeAudit } from "@/server/observability/audit";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { generateTrackingToken, hashTrackingToken } from "@/server/security/tracking-token";
import type { PublicBucket } from "@/server/storage/types";

import { lockPickupDate } from "./capacity";
import { previewCheckout, type CheckoutSummary } from "./checkout";
import { getSettings } from "./settings";

export interface PlaceOrderDeps {
  db: Database;
  clock: Clock;
  publicBucket: Pick<PublicBucket, "publicUrl">;
}

export interface PlacedOrder {
  orderId: string;
  orderNumber: string;
  /** Plaintext access code — returned exactly once; null for idempotent replays (TD-15). */
  trackingToken: string | null;
  duplicate: boolean;
  pickupDate: string;
  paymentMethod: "QRIS" | "BANK_TRANSFER" | "CASH";
  paymentOption: "DP_50" | "FULL";
  payment: PaymentBreakdown;
  reservationExpiresAt: string | null;
}

export type PlaceOrderResult =
  | { ok: true; order: PlacedOrder }
  | {
      ok: false;
      code: "INVALID_INPUT";
      fieldErrors: Partial<Record<string, string>>;
    }
  | { ok: false; code: "RATE_LIMITED" }
  | {
      ok: false;
      code: "CHECKOUT_INVALID";
      fieldErrors: Partial<Record<string, string>>;
      cartIssues?: Array<{ productId: string; issue: string }>;
      pickupReason?: PickupDateReason;
    };

/** Technical throttle for order creation (IMPLEMENTATION-PLAN §30). Not a business rule. */
export const PLACE_ORDER_RATE_LIMIT = {
  limit: 20,
  windowSeconds: 15 * 60,
} as const;
const MAX_ORDER_NUMBER_ATTEMPTS = 5;

const idempotencyKeySchema = z.uuid();

export async function findByIdempotencyKey(db: Pick<Database, "select">, key: string) {
  const [row] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      pickupDate: orders.pickupDate,
      paymentMethod: orders.paymentMethod,
      paymentOption: orders.paymentOption,
      grandTotal: orders.grandTotal,
      reservationExpiresAt: orders.reservationExpiresAt,
    })
    .from(orders)
    .where(eq(orders.idempotencyKey, key))
    .limit(1);
  return row ?? null;
}

export function replay(row: NonNullable<Awaited<ReturnType<typeof findByIdempotencyKey>>>): PlaceOrderResult {
  return {
    ok: true,
    order: {
      orderId: row.id,
      orderNumber: row.orderNumber,
      trackingToken: null,
      duplicate: true,
      pickupDate: row.pickupDate,
      paymentMethod: row.paymentMethod,
      paymentOption: row.paymentOption,
      payment: paymentBreakdown(row.grandTotal, row.paymentOption),
      reservationExpiresAt: row.reservationExpiresAt?.toISOString() ?? null,
    },
  };
}

class PickupUnavailable extends Error {
  constructor(public readonly reason: PickupDateReason) {
    super(reason);
  }
}
class IdempotentReplay extends Error {
  constructor(public readonly result: PlaceOrderResult) {
    super("replay");
  }
}

/**
 * Creates a website order (IMPLEMENTATION-PLAN §11.1). Validation and pricing come
 * from previewCheckout; the pickup date is then re-checked under the per-date row
 * lock (TD-06) so concurrent checkouts can never exceed capacity (EC-01).
 */
export async function placeOrder(deps: PlaceOrderDeps, input: unknown, options: { idempotencyKey: unknown; clientIp: string }): Promise<PlaceOrderResult> {
  const keyParsed = idempotencyKeySchema.safeParse(options.idempotencyKey);
  if (!keyParsed.success)
    return {
      ok: false,
      code: "INVALID_INPUT",
      fieldErrors: { form: "Permintaan tidak valid. Muat ulang halaman." },
    };
  const idempotencyKey = keyParsed.data;

  // One instant for the whole request: preview and the locked re-check agree.
  const now = deps.clock.now();
  const fixedClock: Clock = { now: () => new Date(now.getTime()) };

  const existing = await findByIdempotencyKey(deps.db, idempotencyKey);
  if (existing) return replay(existing);

  const limit = await consumeRateLimit(deps.db, `place-order:ip:${options.clientIp}`, PLACE_ORDER_RATE_LIMIT, now);
  if (!limit.allowed) return { ok: false, code: "RATE_LIMITED" };

  const preview = await previewCheckout({ ...deps, clock: fixedClock }, input);
  if (!preview.ok) {
    return {
      ok: false,
      code: "CHECKOUT_INVALID",
      fieldErrors: preview.fieldErrors,
      cartIssues: preview.cartIssues,
      pickupReason: preview.pickupReason,
    };
  }
  const summary = preview.summary;

  const settings = await getSettings(deps.db);
  const productRows = await deps.db
    .select({
      id: products.id,
      price: products.price,
      salePrice: products.salePrice,
      productType: products.productType,
      minimumPreorderDays: products.minimumPreorderDays,
    })
    .from(products)
    .where(
      inArray(
        products.id,
        summary.lines.map((l) => l.productId),
      ),
    );
  const productFacts = new Map(productRows.map((p) => [p.id, p]));
  const lineFacts = summary.lines.map((l) => productFacts.get(l.productId)!);

  const window = pickupWindow({
    now,
    cutoff: settings.pickup_cutoff,
    bookingHorizonDays: settings.booking_horizon_days,
    maxPreorderDays: maxPreorderDays(lineFacts),
  });

  for (let attempt = 1; attempt <= MAX_ORDER_NUMBER_ATTEMPTS; attempt++) {
    try {
      return await deps.db.transaction(async (tx) => {
        const facts = await lockPickupDate(tx, summary.pickupDate, settings.default_capacity, now);

        // Same key may have committed while we waited for the lock.
        const replayed = await findByIdempotencyKey(tx, idempotencyKey);
        if (replayed) throw new IdempotentReplay(replay(replayed));

        const status = evaluatePickupDate(summary.pickupDate, window, facts);
        if (!status.available) throw new PickupUnavailable(status.reason);

        return await insertOrder(tx, {
          summary,
          now,
          settings,
          idempotencyKey,
          orderDateEffective: effectiveOrderDate(now, settings.pickup_cutoff),
          productFacts,
        });
      });
    } catch (error) {
      if (error instanceof IdempotentReplay) return error.result;
      if (error instanceof PickupUnavailable) {
        return {
          ok: false,
          code: "CHECKOUT_INVALID",
          fieldErrors: {
            pickupDate: "Tanggal ini baru saja tidak tersedia. Silakan pilih tanggal lain.",
          },
          pickupReason: error.reason,
        };
      }
      const constraint = uniqueViolationConstraint(error);
      if (constraint === "orders_idempotency_key_unique") {
        const row = await findByIdempotencyKey(deps.db, idempotencyKey);
        if (row) return replay(row);
      }
      if (constraint === "orders_order_number_unique" && attempt < MAX_ORDER_NUMBER_ATTEMPTS) continue;
      throw error;
    }
  }
  throw new Error("Could not allocate a unique order number");
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Shared by website checkout and Manual Order (FD-80, FD-115): same numbering, token, snapshots, payment. */
export async function insertOrder(
  tx: Tx,
  args: {
    summary: CheckoutSummary;
    now: Date;
    settings: Awaited<ReturnType<typeof getSettings>>;
    idempotencyKey: string;
    orderDateEffective: IsoDate;
    /** Manual Order: the creating admin (source MANUAL, audit actor). */
    createdByAdminId?: string;
    productFacts: Map<
      string,
      {
        price: number;
        salePrice: number | null;
        productType: "READY_STOCK" | "PRE_ORDER";
        minimumPreorderDays: number | null;
      }
    >;
  },
): Promise<PlaceOrderResult> {
  const { summary, now, settings } = args;
  const trackingToken = generateTrackingToken();
  const orderNumber = generateOrderNumber(now, (n) => randomInt(n));
  const isCash = summary.paymentMethod === "CASH";
  const reservationMinutes = summary.paymentMethod === "QRIS" ? settings.qris_reservation_minutes : settings.transfer_reservation_minutes;
  const reservationExpiresAt = isCash ? null : new Date(now.getTime() + reservationMinutes * 60_000);
  const payment = summary.payment;

  const [order] = await tx
    .insert(orders)
    .values({
      orderNumber,
      trackingTokenHash: hashTrackingToken(trackingToken),
      source: args.createdByAdminId ? "MANUAL" : "WEBSITE",
      createdByAdminId: args.createdByAdminId ?? null,
      customerName: summary.customerName,
      customerPhone: summary.whatsapp,
      notes: summary.notes,
      orderDateEffective: args.orderDateEffective,
      pickupDate: summary.pickupDate,
      subtotal: summary.subtotal,
      discountTotal: summary.discountTotal,
      grandTotal: payment.total,
      dpAmount: payment.dpAmount,
      paidAmount: 0,
      remainingAmount: payment.total,
      orderStatus: "NEW",
      paymentStatus: isCash ? "UNPAID" : "WAITING_PAYMENT",
      paymentMethod: summary.paymentMethod,
      paymentOption: summary.paymentOption,
      reservationExpiresAt,
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: orders.id });

  await tx.insert(orderItems).values(
    summary.lines.map((line) => {
      const p = args.productFacts.get(line.productId)!;
      return {
        orderId: order!.id,
        productId: line.productId,
        productNameSnapshot: line.name,
        productTypeSnapshot: p.productType,
        minimumPreorderDaysSnapshot: p.minimumPreorderDays,
        unitPriceSnapshot: p.price,
        salePriceSnapshot: line.effectiveUnitPrice < p.price ? p.salePrice : null,
        effectiveUnitPrice: line.effectiveUnitPrice,
        quantity: line.quantity,
        lineSubtotal: line.lineSubtotal,
      };
    }),
  );

  if (!isCash) {
    // QR generation / transfer instructions attach to this transaction in Phase 5.
    await tx.insert(paymentTransactions).values({
      orderId: order!.id,
      purpose: summary.paymentOption === "DP_50" ? "DP" : "FULL",
      method: summary.paymentMethod,
      amount: payment.dueNow,
      status: "WAITING_PAYMENT",
      expiresAt: reservationExpiresAt,
      createdAt: now,
      updatedAt: now,
    });
  }

  await writeAudit(tx, {
    entityType: "order",
    entityId: order!.id,
    eventType: "ORDER_CREATED",
    newValue: {
      orderNumber,
      orderStatus: "NEW",
      source: args.createdByAdminId ? "MANUAL" : "WEBSITE",
      paymentMethod: summary.paymentMethod,
      paymentOption: summary.paymentOption,
      pickupDate: summary.pickupDate,
      grandTotal: payment.total,
    },
    actor: args.createdByAdminId ? { type: "ADMIN", adminId: args.createdByAdminId } : { type: "SYSTEM" },
  });

  return {
    ok: true,
    order: {
      orderId: order!.id,
      orderNumber,
      trackingToken,
      duplicate: false,
      pickupDate: summary.pickupDate,
      paymentMethod: summary.paymentMethod,
      paymentOption: summary.paymentOption,
      payment,
      reservationExpiresAt: reservationExpiresAt?.toISOString() ?? null,
    },
  };
}
