import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { admins } from "./auth";
import { orders } from "./orders";
import {
  paymentExceptionKindEnum,
  paymentExceptionResolutionEnum,
  paymentExceptionStatusEnum,
  paymentMethodEnum,
  paymentPurposeEnum,
  paymentTransactionStatusEnum,
  proofVerificationStatusEnum,
} from "./enums";

export const paymentTransactions = pgTable(
  "payment_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    purpose: paymentPurposeEnum("purpose").notNull(),
    method: paymentMethodEnum("method").notNull(),
    amount: integer("amount").notNull(),
    status: paymentTransactionStatusEnum("status").notNull(),
    provider: text("provider"),
    providerReference: text("provider_reference"),
    qrString: text("qr_string"),
    /** Initial payments follow the order reservation; remaining payments use their own duration (TD-09). */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    verifiedByAdminId: text("verified_by_admin_id").references(() => admins.id, { onDelete: "restrict" }),
    /** Payment Exception: never counted toward paid_amount (FD-107, FD-118). */
    isException: boolean("is_exception").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payment_transactions_order_id_idx").on(t.orderId),
    index("payment_transactions_status_expires_idx").on(t.status, t.expiresAt),
    unique("payment_transactions_provider_reference_unique").on(t.provider, t.providerReference),
    check("payment_transactions_amount_positive", sql`${t.amount} > 0`),
  ],
);

export const paymentProofs = pgTable(
  "payment_proofs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentTransactionId: uuid("payment_transaction_id").notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    /** Key in the PRIVATE bucket — never a public URL (FD-51). */
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    verificationStatus: proofVerificationStatusEnum("verification_status").notNull().default("PENDING"),
    rejectionReason: text("rejection_reason"),
    verifiedByAdminId: text("verified_by_admin_id").references(() => admins.id, { onDelete: "restrict" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (t) => [
    // Explicit short name: the generated one exceeds PostgreSQL's 63-char identifier limit.
    foreignKey({ name: "payment_proofs_transaction_fk", columns: [t.paymentTransactionId], foreignColumns: [paymentTransactions.id] }).onDelete("restrict"),
    index("payment_proofs_transaction_idx").on(t.paymentTransactionId),
    // FD-50: JPG/JPEG, PNG, PDF; max 5 MB.
    check("payment_proofs_mime_allowed", sql`${t.mimeType} IN ('image/jpeg', 'image/png', 'application/pdf')`),
    check("payment_proofs_size_limit", sql`${t.sizeBytes} > 0 AND ${t.sizeBytes} <= 5242880`),
  ],
);

export const paymentExceptions = pgTable(
  "payment_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentTransactionId: uuid("payment_transaction_id").notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    kind: paymentExceptionKindEnum("kind").notNull(),
    status: paymentExceptionStatusEnum("status").notNull().default("OPEN"),
    resolution: paymentExceptionResolutionEnum("resolution"),
    resolutionNote: text("resolution_note"),
    resolvedByAdminId: text("resolved_by_admin_id").references(() => admins.id, { onDelete: "restrict" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "payment_exceptions_transaction_fk", columns: [t.paymentTransactionId], foreignColumns: [paymentTransactions.id] }).onDelete("restrict"),
    index("payment_exceptions_status_idx").on(t.status),
  ],
);

/**
 * Manual refund records (FD-62, FD-63). `status` values are finalized in Phase 5;
 * kept as text so no refund policy is implied here (FD-64).
 */
export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    paymentTransactionId: uuid("payment_transaction_id").references(() => paymentTransactions.id, { onDelete: "restrict" }),
    amount: integer("amount").notNull(),
    status: text("status").notNull(),
    reason: text("reason").notNull(),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    recordedByAdminId: text("recorded_by_admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("refunds_order_id_idx").on(t.orderId), check("refunds_amount_positive", sql`${t.amount} > 0`)],
);

/** Webhook idempotency log (IMPLEMENTATION-PLAN §16, §32). */
export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    providerEventKey: text("provider_event_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    signatureValid: boolean("signature_valid").notNull(),
    processingResult: text("processing_result"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [unique("payment_webhook_events_provider_event_unique").on(t.provider, t.providerEventKey)],
);
