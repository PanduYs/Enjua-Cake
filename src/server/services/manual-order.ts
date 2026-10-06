import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Clock } from "@/server/clock";
import { uniqueViolationConstraint } from "@/server/db/errors";
import { categories, orderOverrides, products } from "@/server/db/schema";
import { effectiveOrderDate, maxPreorderDays, pickupWindow } from "@/server/domain/checkout/pickup-date";
import { evaluateManualPickupDate, OVERRIDE_TYPES, type OverrideType, type RequiredOverride } from "@/server/domain/orders/manual-overrides";
import { writeAudit } from "@/server/observability/audit";

import { lockPickupDate } from "./capacity";
import { prepareCheckout, type CheckoutDeps } from "./checkout";
import { findByIdempotencyKey, insertOrder, replay, type PlaceOrderResult, type PlacedOrder } from "./place-order";
import { getSettings } from "./settings";

export type ManualOrderResult =
  | { ok: true; order: PlacedOrder }
  | { ok: false; code: "INVALID_INPUT" | "CHECKOUT_INVALID"; fieldErrors: Partial<Record<string, string>>; cartIssues?: Array<{ productId: string; issue: string }> }
  | { ok: false; code: "DATE_NOT_ALLOWED"; blocker: "PAST_DATE" | "BLOCKED" }
  /** One or more of the four overridable rules fail; the admin must explicitly override each with a reason. */
  | { ok: false; code: "OVERRIDE_REQUIRED"; required: RequiredOverride[] };

const overridesSchema = z
  .array(z.object({ type: z.enum(OVERRIDE_TYPES), reason: z.string().trim().max(500) }))
  .max(OVERRIDE_TYPES.length);

class NeedsOverride extends Error {
  constructor(public readonly result: Extract<ManualOrderResult, { ok: false }>) {
    super("override");
  }
}
class Replayed extends Error {
  constructor(public readonly result: PlaceOrderResult) {
    super("replay");
  }
}

/**
 * Manual Order (PRD §50, FD-78–FD-80, FD-110, FD-115, FD-119): the same validation,
 * pricing, capacity lock, numbering, tracking code and payment flow as the website.
 * Only the four listed rules may be overridden, each explicitly with a reason;
 * every applied override is written to order_overrides and the audit log in the
 * same transaction as the order.
 */
export async function placeManualOrder(
  deps: CheckoutDeps,
  input: unknown,
  options: { adminId: string; idempotencyKey: unknown; overrides: unknown },
): Promise<ManualOrderResult> {
  const key = z.uuid().safeParse(options.idempotencyKey);
  const overrides = overridesSchema.safeParse(options.overrides ?? []);
  if (!key.success || !overrides.success) return { ok: false, code: "INVALID_INPUT", fieldErrors: { form: "Permintaan tidak valid. Muat ulang halaman." } };

  const now = deps.clock.now();
  const fixedClock: Clock = { now: () => new Date(now.getTime()) };
  const existing = await findByIdempotencyKey(deps.db, key.data);
  if (existing) return replay(existing) as ManualOrderResult;

  // Products, quantities, Sold Out/inactive, Cash for Pre-Order, DP rules: never overridable.
  // Settings do not depend on the cart: read them while the cart is validated.
  const [prepared, settings] = await Promise.all([prepareCheckout({ ...deps, clock: fixedClock }, input), getSettings(deps.db)]);
  if (!prepared.ok) return { ok: false, code: "CHECKOUT_INVALID", fieldErrors: prepared.fieldErrors, cartIssues: prepared.cartIssues };
  const { summary, productFacts } = prepared;

  const minDays = maxPreorderDays([...productFacts.values()]);
  const window = pickupWindow({ now, cutoff: settings.pickup_cutoff, bookingHorizonDays: settings.booking_horizon_days, maxPreorderDays: minDays });
  const granted = new Map(overrides.data.filter((o) => o.reason.length > 0).map((o) => [o.type, o.reason]));

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await deps.db.transaction(async (tx) => {
        // Same lock as website checkout (FD-80, EC-19); the date stays "full" for the website.
        const facts = await lockPickupDate(tx, summary.pickupDate, settings.default_capacity, now);
        const replayed = await findByIdempotencyKey(tx, key.data);
        if (replayed) throw new Replayed(replay(replayed));

        const evaluation = evaluateManualPickupDate(summary.pickupDate, window, { cutoff: settings.pickup_cutoff, minPreorderDays: minDays, facts });
        if (!evaluation.ok) throw new NeedsOverride({ ok: false, code: "DATE_NOT_ALLOWED", blocker: evaluation.blocker });
        const missing = evaluation.required.filter((r) => !granted.has(r.type));
        if (missing.length > 0) throw new NeedsOverride({ ok: false, code: "OVERRIDE_REQUIRED", required: evaluation.required });

        const placed = await insertOrder(tx, {
          summary,
          now,
          settings,
          idempotencyKey: key.data,
          orderDateEffective: effectiveOrderDate(now, settings.pickup_cutoff),
          productFacts,
          createdByAdminId: options.adminId,
        });
        if (!placed.ok) return placed as ManualOrderResult;

        for (const r of evaluation.required) {
          const reason = granted.get(r.type)!;
          await tx.insert(orderOverrides).values({ orderId: placed.order.orderId, overrideType: r.type, valueBefore: r.before, valueAfter: r.after, reason, adminId: options.adminId, createdAt: now });
          await writeAudit(tx, {
            entityType: "order",
            entityId: placed.order.orderId,
            eventType: "ORDER_OVERRIDE_APPLIED",
            oldValue: r.before,
            newValue: { type: r.type, ...r.after },
            reason,
            actor: { type: "ADMIN", adminId: options.adminId },
          });
        }
        await writeAudit(tx, {
          entityType: "order",
          entityId: placed.order.orderId,
          eventType: "MANUAL_ORDER_CREATED",
          newValue: { orderNumber: placed.order.orderNumber, overrides: evaluation.required.map((r) => r.type) },
          actor: { type: "ADMIN", adminId: options.adminId },
        });
        return placed as ManualOrderResult;
      });
    } catch (error) {
      if (error instanceof NeedsOverride) return error.result;
      if (error instanceof Replayed) return error.result as ManualOrderResult;
      const constraint = uniqueViolationConstraint(error);
      if (constraint === "orders_idempotency_key_unique") {
        const row = await findByIdempotencyKey(deps.db, key.data);
        if (row) return replay(row) as ManualOrderResult;
      }
      if (constraint === "orders_order_number_unique" && attempt < 5) continue;
      throw error;
    }
  }
  throw new Error("Could not allocate a unique order number");
}

export type { OverrideType };

/** Orderable catalog for the Manual Order form (active products in active categories; Sold Out shown but rejected). */
export async function listManualOrderProducts(db: CheckoutDeps["db"]) {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      salePrice: products.salePrice,
      productType: products.productType,
      minimumPreorderDays: products.minimumPreorderDays,
      availability: products.availability,
      maxQuantityPerOrder: products.maxQuantityPerOrder,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.isActive, true), eq(categories.isActive, true)))
    .orderBy(asc(products.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    price: r.salePrice ?? r.price,
    productType: r.productType,
    minimumPreorderDays: r.minimumPreorderDays,
    soldOut: r.availability === "SOLD_OUT",
    maxQuantityPerOrder: r.maxQuantityPerOrder,
  }));
}
