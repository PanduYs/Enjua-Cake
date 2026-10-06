import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { admins } from "./auth";
import { products } from "./catalog";
import {
  actorTypeEnum,
  orderOverrideTypeEnum,
  orderSourceEnum,
  orderStatusEnum,
  paymentMethodEnum,
  paymentOptionEnum,
  paymentStatusEnum,
  productTypeEnum,
} from "./enums";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** ENC-YYYYMMDD-XXXX — identification only, never authentication (FD-70). */
    orderNumber: text("order_number").notNull().unique(),
    /** SHA-256 of the tracking token; plaintext is never stored (FD-68, TD-11). */
    trackingTokenHash: text("tracking_token_hash").notNull().unique(),
    source: orderSourceEnum("source").notNull(),
    createdByAdminId: text("created_by_admin_id").references(() => admins.id, { onDelete: "restrict" }),
    customerName: text("customer_name").notNull(),
    /** E.164 */
    customerPhone: text("customer_phone").notNull(),
    notes: text("notes"),
    /** Business date in WIB after applying pickup cutoff (FD-108). */
    orderDateEffective: date("order_date_effective", { mode: "string" }).notNull(),
    pickupDate: date("pickup_date", { mode: "string" }).notNull(),
    subtotal: integer("subtotal").notNull(),
    discountTotal: integer("discount_total").notNull().default(0),
    grandTotal: integer("grand_total").notNull(),
    dpAmount: integer("dp_amount"),
    paidAmount: integer("paid_amount").notNull().default(0),
    remainingAmount: integer("remaining_amount").notNull(),
    orderStatus: orderStatusEnum("order_status").notNull().default("NEW"),
    paymentStatus: paymentStatusEnum("payment_status").notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    paymentOption: paymentOptionEnum("payment_option").notNull(),
    /** Null for Cash (FD-15). Never reset (FD-120). */
    reservationExpiresAt: timestamp("reservation_expires_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    cancelledByType: actorTypeEnum("cancelled_by_type"),
    cancelledByAdminId: text("cancelled_by_admin_id").references(() => admins.id, { onDelete: "restrict" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_pickup_date_status_idx").on(t.pickupDate, t.orderStatus),
    index("orders_status_reservation_idx").on(t.orderStatus, t.reservationExpiresAt),
    check(
      "orders_amounts_non_negative",
      sql`${t.subtotal} >= 0 AND ${t.discountTotal} >= 0 AND ${t.grandTotal} >= 0 AND ${t.paidAmount} >= 0 AND ${t.remainingAmount} >= 0`,
    ),
    check("orders_dp_amount_valid", sql`${t.dpAmount} IS NULL OR ${t.dpAmount} >= 0`),
    check("orders_cash_full_only", sql`${t.paymentMethod} <> 'CASH' OR ${t.paymentOption} = 'FULL'`),
  ],
).enableRLS();

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    productNameSnapshot: text("product_name_snapshot").notNull(),
    productTypeSnapshot: productTypeEnum("product_type_snapshot").notNull(),
    minimumPreorderDaysSnapshot: integer("minimum_preorder_days_snapshot"),
    unitPriceSnapshot: integer("unit_price_snapshot").notNull(),
    salePriceSnapshot: integer("sale_price_snapshot"),
    effectiveUnitPrice: integer("effective_unit_price").notNull(),
    quantity: integer("quantity").notNull(),
    lineSubtotal: integer("line_subtotal").notNull(),
  },
  (t) => [
    index("order_items_order_id_idx").on(t.orderId),
    check("order_items_quantity_positive", sql`${t.quantity} > 0`),
    check("order_items_amounts_non_negative", sql`${t.effectiveUnitPrice} >= 0 AND ${t.lineSubtotal} >= 0`),
  ],
).enableRLS();

/** Manual Order overrides — every field required by FD-119. */
export const orderOverrides = pgTable(
  "order_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    overrideType: orderOverrideTypeEnum("override_type").notNull(),
    valueBefore: jsonb("value_before").notNull(),
    valueAfter: jsonb("value_after").notNull(),
    reason: text("reason").notNull(),
    adminId: text("admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("order_overrides_order_id_idx").on(t.orderId),
    check("order_overrides_reason_not_blank", sql`length(trim(${t.reason})) > 0`),
  ],
).enableRLS();
